"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getSystemeIoClient } from "@/lib/sync";
import { DEFAULT_PUSH_FIELD_SLUGS } from "@/lib/systemeio";
import { countryToCode } from "@/lib/country-flag";
import { normalizeRegionForCountry } from "@/lib/regions";
import { getDict } from "@/lib/i18n/dictionaries";
import { getValidAccessToken } from "@/lib/google";
import { pushContactToGoogle, deleteGoogleContact } from "@/lib/google-contacts";

// Google Contacts import (see google-contacts.ts) leaves email null for a
// phone-only personal contact, and Contact.email is nullable in the schema
// specifically to allow that — so this can't require a value the way it
// used to. Empty string is normalized to undefined before the .email()
// check runs, so a blank field passes and a genuinely malformed address
// still doesn't.
const ContactSchema = z.object({
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().toLowerCase().email("A valid email is required").optional()
  ),
  email2: z.string().trim().optional(),
  extraEmails: z.array(z.string().trim()).optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  phone2: z.string().trim().optional(),
  extraPhones: z.array(z.string().trim()).optional(),
  company: z.string().trim().optional(),
  nickname: z.string().trim().optional(),
  jobTitle: z.string().trim().optional(),
  birthday: z.string().trim().optional(),
  companyType: z.string().trim().optional(),
  jurisdictionCountry: z.string().trim().optional(),
  jurisdictionRegion: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  locale: z.string().trim().optional(),
  timeZone: z.string().trim().optional(),
  // Only ever actually submitted when the contact isn't systeme.io-synced
  // (see contact-form.tsx) — for a synced contact the field isn't rendered,
  // so this resolves to undefined and Prisma's update leaves it untouched.
  source: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zip: z.string().trim().optional(),
  country: z.string().trim().optional(),
  billingAddress: z.string().trim().optional(),
  billingCity: z.string().trim().optional(),
  billingState: z.string().trim().optional(),
  billingZip: z.string().trim().optional(),
  billingCountry: z.string().trim().optional(),
  billingContactName: z.string().trim().optional(),
  billingEmail: z.string().trim().optional(),
  billingPhone: z.string().trim().optional(),
  websiteDomain: z.string().trim().optional(),
  websiteHostingProvider: z.string().trim().optional(),
  websiteDesignApp: z.string().trim().optional(),
  funnelsDomain: z.string().trim().optional(),
  funnelsHostingProvider: z.string().trim().optional(),
  funnelsDesignApp: z.string().trim().optional(),
  emailDomain: z.string().trim().optional(),
  emailHostingProvider: z.string().trim().optional(),
  emailMarketingApp: z.string().trim().optional(),
  storeDomain: z.string().trim().optional(),
  storeHostingProvider: z.string().trim().optional(),
  storeDesignApp: z.string().trim().optional(),
  autoSendInvoiceReminders: z.boolean(),
  preferredCurrency: z.string().trim().optional(),
  paymentTerms: z.string().trim().optional(),
  paymentSchedule: z.string().trim().optional(),
  defaultDiscount: z.number().optional(),
  stage: z.enum(["LEAD", "PROSPECT", "CLIENT", "PAST_CLIENT", "UNSUBSCRIBED", "PERSONAL"]),
  notes: z.string().trim().optional(),
});

const CONTACT_FORM_FIELDS = [
  "email2",
  "firstName",
  "lastName",
  "phone",
  "phone2",
  "company",
  "nickname",
  "jobTitle",
  "birthday",
  "companyType",
  "jurisdictionCountry",
  "jurisdictionRegion",
  "industry",
  "locale",
  "timeZone",
  "source",
  "preferredCurrency",
  "paymentTerms",
  "paymentSchedule",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "billingAddress",
  "billingCity",
  "billingState",
  "billingZip",
  "billingCountry",
  "billingContactName",
  "billingEmail",
  "billingPhone",
  "websiteDomain",
  "websiteHostingProvider",
  "websiteDesignApp",
  "funnelsDomain",
  "funnelsHostingProvider",
  "funnelsDesignApp",
  "emailDomain",
  "emailHostingProvider",
  "emailMarketingApp",
  "storeDomain",
  "storeHostingProvider",
  "storeDesignApp",
  "notes",
] as const;

// Parallel "socialPlatform"/"socialUrl" inputs (same index = same row),
// submitted alongside the rest of the Contact form — rows with no URL are
// dropped since the platform alone isn't a usable link.
function readSocialLinks(formData: FormData): { platform: string; url: string }[] {
  const platforms = formData.getAll("socialPlatform").map(String);
  const urls = formData.getAll("socialUrl").map(String);
  const links: { platform: string; url: string }[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i].trim();
    if (!url) continue;
    links.push({ platform: (platforms[i] ?? "Other").trim() || "Other", url });
  }
  return links;
}

// Parallel "extraAddress{Address,City,State,Zip,Country}" inputs (same
// index = same row) — additional addresses beyond the main one, added via
// the Contact form's "+" button. A row is kept if any field beyond country
// (the select always has some value) is filled in.
function readExtraAddresses(formData: FormData) {
  const addresses = formData.getAll("extraAddressAddress").map(String);
  const cities = formData.getAll("extraAddressCity").map(String);
  const states = formData.getAll("extraAddressState").map(String);
  const zips = formData.getAll("extraAddressZip").map(String);
  const countries = formData.getAll("extraAddressCountry").map(String);
  const rows: { address: string; city: string; state: string; zip: string; country: string; order: number }[] = [];
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i]?.trim() ?? "";
    const city = cities[i]?.trim() ?? "";
    const zip = zips[i]?.trim() ?? "";
    if (!address && !city && !zip) continue;
    const country = countries[i]?.trim() ?? "";
    rows.push({
      address,
      city,
      state: normalizeRegionForCountry(country, states[i]?.trim()) ?? "",
      zip,
      country,
      order: rows.length,
    });
  }
  return rows;
}

// Parallel "messagingApp"/"messagingHandle" inputs (same index = same row)
// — Telegram/Discord/etc, beyond WhatsApp's own dedicated phone field.
function readMessagingAccounts(formData: FormData) {
  const apps = formData.getAll("messagingApp").map(String);
  const handles = formData.getAll("messagingHandle").map(String);
  const rows: { app: string; handle: string; order: number }[] = [];
  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]?.trim() ?? "";
    if (!handle) continue;
    rows.push({ app: (apps[i] ?? "Other").trim() || "Other", handle, order: rows.length });
  }
  return rows;
}

// Parallel "voipApp"/"voipHandle" inputs (same index = same row) — preferred
// video/voice calling apps, a separate list from the instant-messaging one
// above.
function readVoipAccounts(formData: FormData) {
  const apps = formData.getAll("voipApp").map(String);
  const handles = formData.getAll("voipHandle").map(String);
  const rows: { app: string; handle: string; order: number }[] = [];
  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]?.trim() ?? "";
    if (!handle) continue;
    rows.push({ app: (apps[i] ?? "Other").trim() || "Other", handle, order: rows.length });
  }
  return rows;
}

// Reads one editable "known" systeme.io custom field — the value input and
// a hidden input carrying the exact fieldSlug to write it under (resolved
// client-side in contact-form.tsx: an existing ContactFieldValue row's own
// slug when there is one, otherwise the field's default slug). Returns null
// if the slug is missing (shouldn't happen — the hidden input always
// renders — but guards against a malformed submission touching an
// unintended field).
function readCustomFieldEdit(formData: FormData, valueField: string, slugField: string): { slug: string; value: string } | null {
  const slug = String(formData.get(slugField) ?? "").trim();
  if (!slug) return null;
  return { slug, value: String(formData.get(valueField) ?? "").trim() };
}

// Returns the write(s) as unresolved Prisma operations instead of awaiting
// them here, so the caller can fold them into one batched $transaction
// alongside every other child-row replace below (see the comment on that
// transaction in updateContact for why).
function buildCustomFieldEditOps(db: PrismaClient, contactId: string, formData: FormData) {
  const edits = [
    readCustomFieldEdit(formData, "servicesRequired", "servicesRequiredSlug"),
    readCustomFieldEdit(formData, "projectGoalDescription", "projectGoalDescriptionSlug"),
  ].filter((edit): edit is { slug: string; value: string } => edit !== null);

  return edits.map((edit) =>
    edit.value
      ? db.contactFieldValue.upsert({
          where: { contactId_fieldSlug: { contactId, fieldSlug: edit.slug } },
          update: { value: edit.value },
          create: { contactId, fieldSlug: edit.slug, value: edit.value },
        })
      : db.contactFieldValue.deleteMany({ where: { contactId, fieldSlug: edit.slug } })
  );
}

// Parallel "techStack{Label,Domain,HostingProvider,App}" inputs (same
// index = same row) — extra Tech Stack lines beyond the fixed Website/
// Funnels/Email/Store ones, with a free-text label instead of a fixed name.
function readTechStackItems(formData: FormData) {
  const labels = formData.getAll("techStackLabel").map(String);
  const domains = formData.getAll("techStackDomain").map(String);
  const hostingProviders = formData.getAll("techStackHostingProvider").map(String);
  const apps = formData.getAll("techStackApp").map(String);
  const rows: { label: string; domain: string; hostingProvider: string; app: string; order: number }[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]?.trim() ?? "";
    if (!label) continue;
    rows.push({
      label,
      domain: domains[i]?.trim() ?? "",
      hostingProvider: hostingProviders[i]?.trim() ?? "",
      app: apps[i]?.trim() ?? "",
      order: rows.length,
    });
  }
  return rows;
}

function readContactForm(formData: FormData) {
  const raw: Record<string, string | string[] | boolean | number | undefined> = {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    stage: String(formData.get("stage") ?? "LEAD"),
    extraEmails: formData.getAll("extraEmails").map(String).map((v) => v.trim()).filter(Boolean),
    extraPhones: formData.getAll("extraPhones").map(String).map((v) => v.trim()).filter(Boolean),
    autoSendInvoiceReminders: formData.get("autoSendInvoiceReminders") === "on",
  };
  for (const field of CONTACT_FORM_FIELDS) {
    raw[field] = String(formData.get(field) ?? "").trim() || undefined;
  }
  const discountRaw = String(formData.get("defaultDiscount") ?? "").trim();
  raw.defaultDiscount = discountRaw ? Number(discountRaw) : undefined;
  if (Number.isNaN(raw.defaultDiscount)) raw.defaultDiscount = undefined;
  // Belt-and-suspenders: the edit form's region dropdown already submits a
  // canonical code when the country has one, but this keeps state/province
  // correct for any older data or a direct API call too.
  raw.state = normalizeRegionForCountry(raw.country as string | undefined, raw.state as string | undefined) || undefined;
  raw.billingState = normalizeRegionForCountry(raw.billingCountry as string | undefined, raw.billingState as string | undefined) || undefined;
  raw.jurisdictionRegion =
    normalizeRegionForCountry(raw.jurisdictionCountry as string | undefined, raw.jurisdictionRegion as string | undefined) || undefined;
  const parsed = ContactSchema.parse(raw);
  // Prisma treats an `undefined` property as "leave unchanged", not "clear
  // it" — explicit null is what actually empties the column back out if a
  // previously-set email is removed on the form.
  return { ...parsed, email: parsed.email ?? null };
}

// Core tag-add logic, taking a shared scoped client — callers that already
// have one open (createContact's tag loop, syncContactTags) pass it in
// directly instead of each opening their own fresh connection. The
// exported `addTagToContact` below is the entry point for callers that
// don't have one yet (e.g. a standalone "add tag" button).
async function addTagToContactWith(db: PrismaClient, contactId: string, tagName: string) {
  const name = tagName.trim();
  if (!name) return;

  const tag = await db.tag.upsert({
    where: { name },
    update: {},
    create: { name },
  });

  await db.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId: tag.id } },
    update: {},
    create: { contactId, tagId: tag.id },
  });

  // Best-effort push back to systeme.io — never fails the CRM save itself.
  try {
    const contact = await db.contact.findUnique({ where: { id: contactId } });
    if (contact?.systemeIoId) {
      const client = await getSystemeIoClient(db);
      if (client) {
        let systemeIoTagId = tag.systemeIoId;
        if (!systemeIoTagId) {
          const created = await client.createTag(tag.name);
          systemeIoTagId = created.id;
          await db.tag.update({ where: { id: tag.id }, data: { systemeIoId: created.id } });
        }
        await client.addTagToContact(contact.systemeIoId, systemeIoTagId);
      }
    }
  } catch {
    // Tag is still saved locally even if the systeme.io push fails.
  }

  revalidatePath(`/contacts/${contactId}`);
}

async function removeTagFromContactWith(db: PrismaClient, contactId: string, tagId: string) {
  await db.contactTag.delete({
    where: { contactId_tagId: { contactId, tagId } },
  });

  // Best-effort push back to systeme.io — never fails the CRM save itself.
  try {
    const contact = await db.contact.findUnique({ where: { id: contactId } });
    const tag = await db.tag.findUnique({ where: { id: tagId } });
    if (contact?.systemeIoId && tag?.systemeIoId) {
      const client = await getSystemeIoClient(db);
      if (client) {
        await client.removeTagFromContact(contact.systemeIoId, tag.systemeIoId);
      }
    }
  } catch {
    // Non-fatal — the tag is still removed locally either way.
  }

  revalidatePath(`/contacts/${contactId}`);
}

async function syncContactTagsWith(db: PrismaClient, contactId: string, desiredNames: string[]) {
  const current = await db.contactTag.findMany({ where: { contactId }, include: { tag: true } });
  const currentNames = new Set(current.map((ct) => ct.tag.name));
  const desiredSet = new Set(desiredNames);

  for (const name of desiredNames) {
    if (!currentNames.has(name)) {
      await addTagToContactWith(db, contactId, name);
    }
  }
  for (const ct of current) {
    if (!desiredSet.has(ct.tag.name)) {
      await removeTagFromContactWith(db, contactId, ct.tagId);
    }
  }
}

export async function createContact(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readContactForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  // One shared client for the whole action — the duplicate-email check,
  // the create, every tag upsert, and the activity log entry all reuse it
  // instead of each opening its own fresh Hyperdrive connection (the
  // regular `prisma` proxy opens a new one per property access, and this
  // action alone used to make double digits of them with a few tags).
  const result = await withScopedPrismaClient(async (db) => {
    if (data.email) {
      const existing = await db.contact.findUnique({ where: { email: data.email } });
      if (existing) {
        return { error: t.actions.contactEmailExists };
      }
    }

    const contact = await db.contact.create({
      data: { ...data, source: "manual", ownerId: session.user.id },
    });

    const socialLinks = readSocialLinks(formData);
    if (socialLinks.length > 0) {
      await db.contactSocialLink.createMany({
        data: socialLinks.map((link) => ({ ...link, contactId: contact.id })),
      });
    }

    const extraAddresses = readExtraAddresses(formData);
    if (extraAddresses.length > 0) {
      await db.contactAddress.createMany({
        data: extraAddresses.map((addr) => ({ ...addr, contactId: contact.id })),
      });
    }

    const messagingAccounts = readMessagingAccounts(formData);
    if (messagingAccounts.length > 0) {
      await db.contactMessagingAccount.createMany({
        data: messagingAccounts.map((row) => ({ ...row, contactId: contact.id })),
      });
    }

    const voipAccounts = readVoipAccounts(formData);
    if (voipAccounts.length > 0) {
      await db.contactVoipAccount.createMany({
        data: voipAccounts.map((row) => ({ ...row, contactId: contact.id })),
      });
    }

    const techStackItems = readTechStackItems(formData);
    if (techStackItems.length > 0) {
      await db.contactTechStackItem.createMany({
        data: techStackItems.map((row) => ({ ...row, contactId: contact.id })),
      });
    }

    const customFieldOps = buildCustomFieldEditOps(db, contact.id, formData);
    if (customFieldOps.length > 0) {
      await db.$transaction(customFieldOps);
    }

    const desiredTags = formData.getAll("tags").map(String).filter(Boolean);
    for (const name of desiredTags) {
      await addTagToContactWith(db, contact.id, name);
    }

    await db.activityLogEntry.create({
      data: {
        contactId: contact.id,
        userId: session.user.id,
        message: t.actions.createdContact(session.user.name ?? ""),
      },
    });

    return { contactId: contact.id };
  });

  if ("error" in result) {
    return { error: result.error };
  }

  revalidatePath("/contacts");
  redirect(`/contacts/${result.contactId}`);
}

export async function updateContact(
  contactId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readContactForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  // One shared client for the whole action — see the comment on
  // createContact above for why. This one used to open a connection for
  // the duplicate-email check, the update, syncContactTags's own queries
  // (findMany plus one upsert pair per changed tag), and the systeme.io
  // push's own lookups — 15+ for a save with a couple of tag changes, and
  // has only grown since (jurisdiction/billing fields, messaging accounts,
  // VoIP accounts). Each of those extra round trips is real wall-clock time
  // against Hyperdrive/Neon within the one Cloudflare Workers invocation
  // handling this request — stack up enough of them (this used to be 10
  // separate awaits just for the 5 child collections below, one deleteMany
  // + createMany pair apiece) and the request risks the Workers CPU/time
  // budget, which surfaces to the user as a plain "Error 1102" with no
  // useful detail, and can leave this request's DB connection in-flight
  // (never reaching the `finally` in withScopedPrismaClient that would
  // close it) if the isolate gets killed mid-request — which then trips up
  // unrelated requests too until Neon reaps the abandoned connection. The
  // fix here isn't fewer statements (the full-replace-per-collection
  // approach is unchanged) but fewer *round trips*: every child-row write
  // below goes into one batched $transaction instead of 10+ sequential
  // `await`s.
  const result = await withScopedPrismaClient(async (db) => {
    if (data.email) {
      const existing = await db.contact.findFirst({
        where: { email: data.email, NOT: { id: contactId } },
      });
      if (existing) {
        return { error: t.actions.contactEmailExistsOther };
      }
    }

    const updated = await db.contact.update({ where: { id: contactId }, data });

    // Full replace, not a diff — simplest correct sync for a small,
    // order-sensitive list with no other side effects (unlike tags, nothing
    // else references a social link by id).
    const socialLinks = readSocialLinks(formData);
    const extraAddresses = readExtraAddresses(formData);
    const messagingAccounts = readMessagingAccounts(formData);
    const voipAccounts = readVoipAccounts(formData);
    const techStackItems = readTechStackItems(formData);

    await db.$transaction([
      db.contactSocialLink.deleteMany({ where: { contactId } }),
      ...(socialLinks.length > 0
        ? [db.contactSocialLink.createMany({ data: socialLinks.map((link) => ({ ...link, contactId })) })]
        : []),
      db.contactAddress.deleteMany({ where: { contactId } }),
      ...(extraAddresses.length > 0
        ? [db.contactAddress.createMany({ data: extraAddresses.map((addr) => ({ ...addr, contactId })) })]
        : []),
      db.contactMessagingAccount.deleteMany({ where: { contactId } }),
      ...(messagingAccounts.length > 0
        ? [db.contactMessagingAccount.createMany({ data: messagingAccounts.map((row) => ({ ...row, contactId })) })]
        : []),
      db.contactVoipAccount.deleteMany({ where: { contactId } }),
      ...(voipAccounts.length > 0
        ? [db.contactVoipAccount.createMany({ data: voipAccounts.map((row) => ({ ...row, contactId })) })]
        : []),
      db.contactTechStackItem.deleteMany({ where: { contactId } }),
      ...(techStackItems.length > 0
        ? [db.contactTechStackItem.createMany({ data: techStackItems.map((row) => ({ ...row, contactId })) })]
        : []),
      ...buildCustomFieldEditOps(db, contactId, formData),
    ]);

    const desiredTags = formData.getAll("tags").map(String).filter(Boolean);
    await syncContactTagsWith(db, contactId, desiredTags);

    // Best-effort push back to systeme.io — never fails the CRM save itself.
    // Reported back either way (success or failure) so "Contact updated"
    // doesn't leave the user guessing whether systeme.io actually got it.
    let syncStatus = "";
    if (updated.systemeIoId) {
      try {
        const client = await getSystemeIoClient(db);
        if (client) {
          const fields: Record<string, string> = {};
          for (const [column, slug] of Object.entries(DEFAULT_PUSH_FIELD_SLUGS)) {
            const value = (data as unknown as Record<string, string | undefined>)[column];
            if (!value) continue;
            // systeme.io's "country" field expects a 2-letter ISO 3166 code
            // (per its API docs), not the full country name the CRM stores.
            fields[slug] = column === "country" ? (countryToCode(value) ?? value) : value;
          }
          const { skipped } = await client.updateContactFields(updated.systemeIoId, fields);
          syncStatus =
            skipped.length > 0 ? t.actions.contactUpdatedPartialWarning(skipped) : t.actions.contactUpdatedSystemeIoSynced;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        syncStatus = t.actions.contactUpdatedWarning(message);
      }
    }

    // Best-effort push back to Google Contacts too, for a contact that was
    // imported from (or linked to) one — same "never fails the CRM save,
    // always reported" shape as the systeme.io push above. Requires the
    // read/write `contacts` scope (see api/google/connect/route.ts); an
    // account still on the older contacts.readonly grant needs to
    // reconnect once before this can succeed.
    if (updated.googleContactId) {
      try {
        const accessToken = await getValidAccessToken(session.user.id, db);
        if (accessToken) {
          const pushResult = await pushContactToGoogle(accessToken, updated.googleContactId, updated);
          syncStatus += pushResult.error ? t.actions.contactUpdatedGoogleWarning(pushResult.error) : t.actions.contactUpdatedGoogleSynced;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        syncStatus += t.actions.contactUpdatedGoogleWarning(message);
      }
    }

    return { syncStatus };
  });

  if ("error" in result) {
    return { error: result.error };
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function deleteContact(contactId: string): Promise<never> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const syncStatus = await withScopedPrismaClient(async (db) => {
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      select: { systemeIoId: true, googleContactId: true },
    });

    // Best-effort deletes on the linked services first, while the contact's
    // own ids are still around to look them up by — never fails the CRM
    // delete itself, but reported either way so "Contact deleted" doesn't
    // leave the user guessing whether the other side actually got it too.
    let status = "";
    if (contact?.systemeIoId) {
      try {
        const client = await getSystemeIoClient(db);
        if (client) {
          await client.deleteContact(contact.systemeIoId);
          status += t.actions.contactDeletedSystemeIoSynced;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        status += t.actions.contactDeletedSystemeIoWarning(message);
      }
    }

    if (contact?.googleContactId) {
      try {
        const accessToken = await getValidAccessToken(session.user.id, db);
        if (accessToken) {
          const result = await deleteGoogleContact(accessToken, contact.googleContactId);
          status += result.error ? t.actions.contactDeletedGoogleWarning(result.error) : t.actions.contactDeletedGoogleSynced;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        status += t.actions.contactDeletedGoogleWarning(message);
      }
    }

    await db.contact.delete({ where: { id: contactId } });
    return status;
  });

  revalidatePath("/contacts");
  // A Server Action's own page re-renders automatically once the action
  // resolves — since this contact is now gone, staying on `/contacts/[id]`
  // would just re-render into that route's own "not found" page, wiping
  // out any client-side toast state in the process. Redirecting here
  // (server-side, before the client ever gets a chance to render that) and
  // carrying the message as a query param is what lets the Contacts list
  // show it instead.
  redirect(`/contacts?deleted=${encodeURIComponent(`${t.actions.contactDeleted}${syncStatus}`)}`);
}

export async function addTagToContact(contactId: string, tagName: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  await withScopedPrismaClient((db) => addTagToContactWith(db, contactId, tagName));
}

export async function removeTagFromContact(contactId: string, tagId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  await withScopedPrismaClient((db) => removeTagFromContactWith(db, contactId, tagId));
}

export async function addContactNote(contactId: string, formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const message = String(formData.get("note") ?? "").trim();
  if (!message) return;

  await withScopedPrismaClient((db) =>
    db.activityLogEntry.create({
      data: {
        contactId,
        userId: session.user.id,
        message: t.actions.addedNote(session.user.name ?? "", message),
      },
    })
  );

  revalidatePath(`/contacts/${contactId}`);
}
