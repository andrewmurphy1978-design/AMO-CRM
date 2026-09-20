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

const ContactSchema = z.object({
  email: z.string().email("A valid email is required"),
  email2: z.string().trim().optional(),
  extraEmails: z.array(z.string().trim()).optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  phone2: z.string().trim().optional(),
  extraPhones: z.array(z.string().trim()).optional(),
  whatsapp: z.string().trim().optional(),
  company: z.string().trim().optional(),
  locale: z.string().trim().optional(),
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
  stage: z.enum(["LEAD", "PROSPECT", "CLIENT", "PAST_CLIENT", "UNSUBSCRIBED"]),
  notes: z.string().trim().optional(),
});

const CONTACT_FORM_FIELDS = [
  "email2",
  "firstName",
  "lastName",
  "phone",
  "phone2",
  "whatsapp",
  "company",
  "locale",
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
  const raw: Record<string, string | string[] | boolean | undefined> = {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    stage: String(formData.get("stage") ?? "LEAD"),
    extraEmails: formData.getAll("extraEmails").map(String).map((v) => v.trim()).filter(Boolean),
    extraPhones: formData.getAll("extraPhones").map(String).map((v) => v.trim()).filter(Boolean),
    autoSendInvoiceReminders: formData.get("autoSendInvoiceReminders") === "on",
  };
  for (const field of CONTACT_FORM_FIELDS) {
    raw[field] = String(formData.get(field) ?? "").trim() || undefined;
  }
  // Belt-and-suspenders: the edit form's region dropdown already submits a
  // canonical code when the country has one, but this keeps state/province
  // correct for any older data or a direct API call too.
  raw.state = normalizeRegionForCountry(raw.country as string | undefined, raw.state as string | undefined) || undefined;
  raw.billingState = normalizeRegionForCountry(raw.billingCountry as string | undefined, raw.billingState as string | undefined) || undefined;
  return ContactSchema.parse(raw);
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
    const existing = await db.contact.findUnique({ where: { email: data.email } });
    if (existing) {
      return { error: t.actions.contactEmailExists };
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

    const techStackItems = readTechStackItems(formData);
    if (techStackItems.length > 0) {
      await db.contactTechStackItem.createMany({
        data: techStackItems.map((row) => ({ ...row, contactId: contact.id })),
      });
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
  // push's own lookups — 15+ for a save with a couple of tag changes.
  const result = await withScopedPrismaClient(async (db) => {
    const existing = await db.contact.findFirst({
      where: { email: data.email, NOT: { id: contactId } },
    });
    if (existing) {
      return { error: t.actions.contactEmailExistsOther };
    }

    const updated = await db.contact.update({ where: { id: contactId }, data });

    // Full replace, not a diff — simplest correct sync for a small,
    // order-sensitive list with no other side effects (unlike tags, nothing
    // else references a social link by id).
    const socialLinks = readSocialLinks(formData);
    await db.contactSocialLink.deleteMany({ where: { contactId } });
    if (socialLinks.length > 0) {
      await db.contactSocialLink.createMany({
        data: socialLinks.map((link) => ({ ...link, contactId })),
      });
    }

    const extraAddresses = readExtraAddresses(formData);
    await db.contactAddress.deleteMany({ where: { contactId } });
    if (extraAddresses.length > 0) {
      await db.contactAddress.createMany({
        data: extraAddresses.map((addr) => ({ ...addr, contactId })),
      });
    }

    const messagingAccounts = readMessagingAccounts(formData);
    await db.contactMessagingAccount.deleteMany({ where: { contactId } });
    if (messagingAccounts.length > 0) {
      await db.contactMessagingAccount.createMany({
        data: messagingAccounts.map((row) => ({ ...row, contactId })),
      });
    }

    const techStackItems = readTechStackItems(formData);
    await db.contactTechStackItem.deleteMany({ where: { contactId } });
    if (techStackItems.length > 0) {
      await db.contactTechStackItem.createMany({
        data: techStackItems.map((row) => ({ ...row, contactId })),
      });
    }

    const desiredTags = formData.getAll("tags").map(String).filter(Boolean);
    await syncContactTagsWith(db, contactId, desiredTags);

    // Best-effort push back to systeme.io — never fails the CRM save itself.
    let warning = "";
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
          if (skipped.length > 0) {
            warning = t.actions.contactUpdatedPartialWarning(skipped);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        warning = t.actions.contactUpdatedWarning(message);
      }
    }

    return { warning };
  });

  if ("error" in result) {
    return { error: result.error };
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return { success: `${t.actions.contactUpdated}${result.warning}` };
}

export async function deleteContact(contactId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await withScopedPrismaClient((db) => db.contact.delete({ where: { id: contactId } }));
  revalidatePath("/contacts");
  redirect("/contacts");
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
