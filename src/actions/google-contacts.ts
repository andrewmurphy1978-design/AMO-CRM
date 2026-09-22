"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/google";
import { listGoogleContacts, type GoogleContactSummary } from "@/lib/google-contacts";

export interface ImportGoogleContactsResult {
  error?: string;
  success?: string;
  imported?: number;
  linked?: number;
  totalFetched?: number;
}

// Compares phone numbers across whatever formatting Google vs. the CRM
// happen to store the same number in (spaces, dashes, parens, a leading
// "+1") without a full phone-parsing library — strip everything but
// digits and compare the last 10, which covers the North American numbers
// this CRM's contacts overwhelmingly are. Good enough for a dedupe
// heuristic; a false negative here just means a contact gets created
// instead of matched, never the reverse.
function normalizePhoneForMatch(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function splitDisplayName(displayName: string): { firstName: string | null; lastName: string | null } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  const [first, ...rest] = parts;
  return { firstName: first, lastName: rest.join(" ") || null };
}

// One-click pull of every Google Contact into the CRM (see the plan
// discussed with the user: pull direction first, push direction later).
// A Google contact whose email/phone already matches an existing CRM
// contact (e.g. a systeme.io lead who's also a personal contact) is only
// linked via googleContactId, never overwritten — the CRM's own data
// stays authoritative. Everything else becomes a new Contact in the
// PERSONAL stage, which keeps it out of the sales pipeline and (since it
// has no systemeIoId) means it's never pushed back to systeme.io by the
// contact-save action.
export async function importGoogleContactsAction(): Promise<ImportGoogleContactsResult> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  return withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" };

    let googleContacts: GoogleContactSummary[];
    try {
      googleContacts = await listGoogleContacts(accessToken);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: message };
    }

    // Loaded once for every existing contact rather than one query per
    // Google contact — a personal address book can run into the
    // thousands, and N+1 queries here would cost far more than this single
    // page load's worth of DB round trips should.
    const existing = await db.contact.findMany({
      select: {
        id: true,
        email: true,
        email2: true,
        extraEmails: true,
        phone: true,
        phone2: true,
        extraPhones: true,
        googleContactId: true,
      },
    });

    const byGoogleId = new Set(existing.map((c) => c.googleContactId).filter((v): v is string => Boolean(v)));
    const byEmail = new Map<string, string>();
    const byPhone = new Map<string, string>();
    for (const c of existing) {
      for (const email of [c.email, c.email2, ...c.extraEmails]) {
        if (email) byEmail.set(email.toLowerCase(), c.id);
      }
      for (const phone of [c.phone, c.phone2, ...c.extraPhones]) {
        const normalized = phone ? normalizePhoneForMatch(phone) : "";
        if (normalized) byPhone.set(normalized, c.id);
      }
    }

    let imported = 0;
    let linked = 0;
    // Guards against two Google contacts sharing the same email creating
    // two CRM rows in the same run (the DB's own unique constraint on
    // Contact.email would only catch this on the second insert, as an
    // exception — this avoids relying on that).
    const seenEmailsThisRun = new Set<string>();

    for (const gc of googleContacts) {
      if (byGoogleId.has(gc.resourceName)) continue; // already imported/linked in a previous run

      const matchEmail = gc.emails.find((e) => byEmail.has(e.toLowerCase()));
      const matchPhone = matchEmail ? undefined : gc.phones.find((p) => byPhone.has(normalizePhoneForMatch(p)));
      const matchedContactId = matchEmail
        ? byEmail.get(matchEmail.toLowerCase())
        : matchPhone
          ? byPhone.get(normalizePhoneForMatch(matchPhone))
          : undefined;

      if (matchedContactId) {
        await db.contact.update({ where: { id: matchedContactId }, data: { googleContactId: gc.resourceName } });
        linked += 1;
        continue;
      }

      if (gc.emails.length === 0 && gc.phones.length === 0) continue; // nothing to identify this contact by at all

      const [firstEmail, secondEmail, ...restEmails] = gc.emails;
      if (firstEmail && seenEmailsThisRun.has(firstEmail.toLowerCase())) continue;
      const [firstPhone, secondPhone, ...restPhones] = gc.phones;

      let firstName = gc.firstName;
      let lastName = gc.lastName;
      if (!firstName && !lastName && gc.displayName) {
        ({ firstName, lastName } = splitDisplayName(gc.displayName));
      }
      // A contact with no name at all (rare, but Google allows saving a
      // bare number/address) still needs something to show in a contact
      // list row rather than a blank name — fall back to whatever
      // identifies it.
      if (!firstName && !lastName) {
        firstName = firstEmail ?? firstPhone ?? null;
      }

      try {
        await db.contact.create({
          data: {
            email: firstEmail ?? null,
            email2: secondEmail ?? null,
            extraEmails: restEmails,
            phone: firstPhone ?? null,
            phone2: secondPhone ?? null,
            extraPhones: restPhones,
            firstName,
            lastName,
            company: gc.company,
            stage: "PERSONAL",
            source: "google_contacts",
            googleContactId: gc.resourceName,
          },
        });
        if (firstEmail) seenEmailsThisRun.add(firstEmail.toLowerCase());
        imported += 1;
      } catch {
        // A unique-constraint race the matching above didn't catch —
        // skip this one contact rather than fail the whole import.
      }
    }

    revalidatePath("/contacts");
    revalidatePath("/settings");
    return { success: "imported", imported, linked, totalFetched: googleContacts.length };
  });
}
