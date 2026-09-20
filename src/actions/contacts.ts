"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getSystemeIoClient } from "@/lib/sync";
import { DEFAULT_PUSH_FIELD_SLUGS } from "@/lib/systemeio";
import { countryToCode } from "@/lib/country-flag";
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
  otherAddress: z.string().trim().optional(),
  otherCity: z.string().trim().optional(),
  otherState: z.string().trim().optional(),
  otherZip: z.string().trim().optional(),
  otherCountry: z.string().trim().optional(),
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
  "otherAddress",
  "otherCity",
  "otherState",
  "otherZip",
  "otherCountry",
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

function readContactForm(formData: FormData) {
  const raw: Record<string, string | string[] | undefined> = {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    stage: String(formData.get("stage") ?? "LEAD"),
    extraEmails: formData.getAll("extraEmails").map(String).map((v) => v.trim()).filter(Boolean),
    extraPhones: formData.getAll("extraPhones").map(String).map((v) => v.trim()).filter(Boolean),
  };
  for (const field of CONTACT_FORM_FIELDS) {
    raw[field] = String(formData.get(field) ?? "").trim() || undefined;
  }
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
