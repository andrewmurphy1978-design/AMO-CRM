"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/google";
import { listGoogleContacts, type GoogleContactSummary } from "@/lib/google-contacts";
import { getTimezoneFromAreaCode } from "@/lib/timezone";

export interface ImportGoogleContactsResult {
  error?: string;
  success?: string;
  imported?: number;
  linked?: number;
  enriched?: number;
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

// Turns an arbitrary Google custom-field key (or IM protocol name) into a
// safe ContactFieldValue slug — lowercase, non-alphanumeric collapsed to
// underscores. "google_" prefixed by every caller so these can never
// collide with a systeme.io field slug.
function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

// contact_field_values.fieldSlug has no enforced DB foreign key to
// custom_field_definitions (see that table's migration) — this upsert is
// purely so the Contact Info page's "other fields" section (which looks
// up ContactFieldValue.definition.label) shows a human label instead of
// the raw slug, not a requirement for the value itself to save.
async function ensureCustomFieldDefinition(db: PrismaClient, slug: string, label: string): Promise<void> {
  await db.customFieldDefinition.upsert({ where: { slug }, update: {}, create: { slug, label, type: "text" } });
}

// Pairs with the `locale: "fr"` default set on a freshly created Google
// Contacts import (see its comment) — the same existing "Français"/
// "English" language tags every systeme.io contact already uses (see
// isLanguageTag in tag-colors.ts), so a new personal contact shows up in
// the Contacts list the same way a French-speaking systeme.io lead does.
async function assignFrenchTag(db: PrismaClient, contactId: string): Promise<void> {
  const tag = await db.tag.upsert({ where: { name: "Français" }, update: {}, create: { name: "Français" } });
  await db.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId: tag.id } },
    update: {},
    create: { contactId, tagId: tag.id },
  });
}

interface ExistingContactRow {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  company: string | null;
  jobTitle: string | null;
  birthday: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  website: string | null;
  notes: string | null;
  timeZone: string | null;
}

// Everything beyond the identity fields (name/email/phone, set once at
// creation) — run for both a freshly created contact (existing: null, so
// every field below counts as empty) and an already-linked one on a
// repeat import (existing holds its current values, so only genuinely
// empty fields get filled). Never overwrites a non-empty value; the CRM's
// own data always wins. Every write here is idempotent (checked against
// what's already there, or an upsert) since this same contact can be
// enriched again on every future re-import once it's linked — a plain
// unconditional `create` in any of the list-shaped sections below would
// duplicate that row on every subsequent run. Returns whether it actually
// changed anything, so the caller can report a meaningful count.
async function enrichContact(db: PrismaClient, contactId: string, existing: ExistingContactRow | null, gc: GoogleContactSummary): Promise<boolean> {
  let changed = false;

  const scalarUpdates: Record<string, string> = {};
  const primaryAddress = gc.addresses[0];
  if (primaryAddress) {
    if (primaryAddress.address && !existing?.address) scalarUpdates.address = primaryAddress.address;
    if (primaryAddress.city && !existing?.city) scalarUpdates.city = primaryAddress.city;
    if (primaryAddress.state && !existing?.state) scalarUpdates.state = primaryAddress.state;
    if (primaryAddress.zip && !existing?.zip) scalarUpdates.zip = primaryAddress.zip;
    if (primaryAddress.country && !existing?.country) scalarUpdates.country = primaryAddress.country;
  }
  if (gc.company && !existing?.company) scalarUpdates.company = gc.company;
  if (gc.jobTitle && !existing?.jobTitle) scalarUpdates.jobTitle = gc.jobTitle;
  if (gc.birthday && !existing?.birthday) scalarUpdates.birthday = gc.birthday;
  if (gc.nickname && !existing?.nickname) scalarUpdates.nickname = gc.nickname;
  if (gc.avatarUrl && !existing?.avatarUrl) scalarUpdates.avatarUrl = gc.avatarUrl;
  const primaryWebsiteUsed = Boolean(existing?.website);
  if (gc.websites[0] && !existing?.website) scalarUpdates.website = gc.websites[0];
  if (gc.notes && !existing?.notes) scalarUpdates.notes = gc.notes;
  // Google's own addresses (handled above) are the better signal when
  // present, but a personal contact frequently has a phone with no
  // address on file at all — the area code is often the only regional
  // clue available (see getTimezoneFromAreaCode's comment).
  if (!existing?.timeZone) {
    const tz = getTimezoneFromAreaCode(gc.phones[0]);
    if (tz) scalarUpdates.timeZone = tz;
  }

  if (Object.keys(scalarUpdates).length > 0) {
    await db.contact.update({ where: { id: contactId }, data: scalarUpdates });
    changed = true;
  }

  // Additional addresses beyond the primary one — same "+" pattern as the
  // Contact form's own extra-address rows. Matched against what's already
  // there (by address+city+zip) so a repeat import never appends the same
  // address twice.
  const extraAddresses = gc.addresses.slice(1);
  if (extraAddresses.length > 0) {
    const existingAddresses = await db.contactAddress.findMany({ where: { contactId }, select: { address: true, city: true, zip: true } });
    const existingKeys = new Set(existingAddresses.map((a) => `${a.address ?? ""}|${a.city ?? ""}|${a.zip ?? ""}`));
    let order = existingAddresses.length;
    for (const addr of extraAddresses) {
      const key = `${addr.address ?? ""}|${addr.city ?? ""}|${addr.zip ?? ""}`;
      if (existingKeys.has(key)) continue;
      await db.contactAddress.create({
        data: { contactId, address: addr.address, city: addr.city, state: addr.state, zip: addr.zip, country: addr.country, order: order++ },
      });
      changed = true;
    }
  }

  // Websites beyond whichever one filled (or didn't need to fill) the
  // `website` column become social-link rows — "Website" is a real
  // SOCIAL_PLATFORMS value (see contact-form.tsx), so this never produces
  // a value the Contact Edit form's platform dropdown can't display.
  // Checked against what's already there so a repeat import never
  // appends the same URL twice.
  const extraWebsites = primaryWebsiteUsed ? gc.websites : gc.websites.slice(1);
  if (extraWebsites.length > 0) {
    const existingLinks = await db.contactSocialLink.findMany({ where: { contactId, platform: "Website" }, select: { url: true } });
    const existingUrls = new Set(existingLinks.map((l) => l.url));
    for (const url of extraWebsites) {
      if (existingUrls.has(url)) continue;
      await db.contactSocialLink.create({ data: { contactId, platform: "Website", url } });
      changed = true;
    }
  }

  // Skype is the one IM protocol with an exact match in VOIP_APPS (see
  // platform-icons.ts) — everything else (Google Talk, AIM, ICQ, Jabber,
  // MSN, QQ, Yahoo Messenger, ...) has no fixed dropdown to safely land
  // in (an unlisted value there would silently reset to the dropdown's
  // first option the next time this contact is saved through the Edit
  // form), so those go to the same custom-field overflow as userDefined
  // fields below instead.
  for (const im of gc.imAccounts) {
    if (im.protocol.toLowerCase() === "skype") {
      const alreadyHasSkype = await db.contactVoipAccount.findFirst({ where: { contactId, app: "Skype" } });
      if (!alreadyHasSkype) {
        await db.contactVoipAccount.create({ data: { contactId, app: "Skype", handle: im.username } });
        changed = true;
      }
    } else {
      const slug = `google_im_${slugify(im.protocol)}`;
      const before = await db.contactFieldValue.findUnique({ where: { contactId_fieldSlug: { contactId, fieldSlug: slug } } });
      if (before?.value !== im.username) {
        await db.contactFieldValue.upsert({
          where: { contactId_fieldSlug: { contactId, fieldSlug: slug } },
          update: { value: im.username },
          create: { contactId, fieldSlug: slug, value: im.username },
        });
        await ensureCustomFieldDefinition(db, slug, `IM (${im.protocol})`);
        changed = true;
      }
    }
  }

  // Arbitrary custom fields the user typed into Google Contacts' own
  // "Custom field" section — same overflow bucket systeme.io's own
  // unmapped fields already use (see PROMOTED_FIELD_SLUGS in sync.ts).
  for (const field of gc.customFields) {
    const slug = `google_${slugify(field.key)}`;
    const before = await db.contactFieldValue.findUnique({ where: { contactId_fieldSlug: { contactId, fieldSlug: slug } } });
    if (before?.value !== field.value) {
      await db.contactFieldValue.upsert({
        where: { contactId_fieldSlug: { contactId, fieldSlug: slug } },
        update: { value: field.value },
        create: { contactId, fieldSlug: slug, value: field.value },
      });
      await ensureCustomFieldDefinition(db, slug, field.key);
      changed = true;
    }
  }

  // Google's contact-group labels (Family, Friends, ...) become CRM tags
  // — real organizational signal for exactly the personal contacts this
  // import targets, and the CRM already has a tagging system to hold it.
  for (const groupName of gc.groupNames) {
    const tag = await db.tag.upsert({ where: { name: groupName }, update: {}, create: { name: groupName } });
    const existingTag = await db.contactTag.findUnique({ where: { contactId_tagId: { contactId, tagId: tag.id } } });
    if (!existingTag) {
      await db.contactTag.create({ data: { contactId, tagId: tag.id } });
      changed = true;
    }
  }

  return changed;
}

// One-click pull of every Google Contact into the CRM (see the plan
// discussed with the user: pull direction first, push direction later),
// importing every field Google's People API offers a reasonable CRM
// mapping for (see google-contacts.ts's header comment for what's
// deliberately left out). A Google contact whose email/phone already
// matches an existing CRM contact (e.g. a systeme.io lead who's also a
// personal contact) is linked via googleContactId and enriched with
// whatever fields it doesn't already have — never overwritten; the CRM's
// own data always wins on a conflict. Everything else becomes a new
// Contact in the PERSONAL stage, which keeps it out of the sales pipeline
// and (since it has no systemeIoId) means it's never pushed back to
// systeme.io by the contact-save action.
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
        address: true,
        city: true,
        state: true,
        zip: true,
        country: true,
        company: true,
        jobTitle: true,
        birthday: true,
        nickname: true,
        avatarUrl: true,
        website: true,
        notes: true,
        timeZone: true,
      },
    });

    const byGoogleId = new Map<string, string>();
    const byEmail = new Map<string, string>();
    const byPhone = new Map<string, string>();
    const existingById = new Map<string, ExistingContactRow>();
    for (const c of existing) {
      existingById.set(c.id, c);
      if (c.googleContactId) byGoogleId.set(c.googleContactId, c.id);
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
    let enriched = 0;
    // Guards against two Google contacts sharing the same email creating
    // two CRM rows in the same run (the DB's own unique constraint on
    // Contact.email would only catch this on the second insert, as an
    // exception — this avoids relying on that).
    const seenEmailsThisRun = new Set<string>();

    for (const gc of googleContacts) {
      // Already linked from a previous run — nothing to (re)match or
      // create, but still worth enriching: a field this import didn't
      // know how to pull before (or that Google itself added since) can
      // still be backfilled, same as a first-time import.
      const alreadyLinkedId = byGoogleId.get(gc.resourceName);
      if (alreadyLinkedId) {
        const didChange = await enrichContact(db, alreadyLinkedId, existingById.get(alreadyLinkedId) ?? null, gc);
        if (didChange) enriched += 1;
        continue;
      }

      const matchEmail = gc.emails.find((e) => byEmail.has(e.toLowerCase()));
      const matchPhone = matchEmail ? undefined : gc.phones.find((p) => byPhone.has(normalizePhoneForMatch(p)));
      const matchedContactId = matchEmail
        ? byEmail.get(matchEmail.toLowerCase())
        : matchPhone
          ? byPhone.get(normalizePhoneForMatch(matchPhone))
          : undefined;

      if (matchedContactId) {
        await db.contact.update({ where: { id: matchedContactId }, data: { googleContactId: gc.resourceName } });
        await enrichContact(db, matchedContactId, existingById.get(matchedContactId) ?? null, gc);
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
        const created = await db.contact.create({
          data: {
            email: firstEmail ?? null,
            email2: secondEmail ?? null,
            extraEmails: restEmails,
            phone: firstPhone ?? null,
            phone2: secondPhone ?? null,
            extraPhones: restPhones,
            firstName,
            lastName,
            // This CRM's own contacts are overwhelmingly Quebec-based, and a
            // personal Google Contacts import (as opposed to a systeme.io
            // lead, which already carries its own real locale) has no other
            // language signal at all — French is the correct default here,
            // never applied to a contact matched to an existing one below.
            locale: "fr",
            stage: "PERSONAL",
            source: "google_contacts",
            googleContactId: gc.resourceName,
          },
        });
        await assignFrenchTag(db, created.id);
        await enrichContact(db, created.id, null, gc);
        if (firstEmail) seenEmailsThisRun.add(firstEmail.toLowerCase());
        imported += 1;
      } catch {
        // A unique-constraint race the matching above didn't catch —
        // skip this one contact rather than fail the whole import.
      }
    }

    revalidatePath("/contacts");
    revalidatePath("/settings");
    return { success: "imported", imported, linked, enriched, totalFetched: googleContacts.length };
  });
}
