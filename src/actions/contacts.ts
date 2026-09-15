"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSystemeIoClient } from "@/lib/sync";
import { DEFAULT_PUSH_FIELD_SLUGS } from "@/lib/systemeio";
import { getDict } from "@/lib/i18n/dictionaries";

const ContactSchema = z.object({
  email: z.string().email("A valid email is required"),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  phone2: z.string().trim().optional(),
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
  stage: z.enum(["LEAD", "PROSPECT", "CLIENT", "PAST_CLIENT", "UNSUBSCRIBED"]),
  notes: z.string().trim().optional(),
});

const CONTACT_FORM_FIELDS = [
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
  "notes",
] as const;

function readContactForm(formData: FormData) {
  const raw: Record<string, string | undefined> = {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    stage: String(formData.get("stage") ?? "LEAD"),
  };
  for (const field of CONTACT_FORM_FIELDS) {
    raw[field] = String(formData.get(field) ?? "").trim() || undefined;
  }
  return ContactSchema.parse(raw);
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

  const existing = await prisma.contact.findUnique({ where: { email: data.email } });
  if (existing) {
    return { error: t.actions.contactEmailExists };
  }

  const contact = await prisma.contact.create({
    data: { ...data, source: "manual", ownerId: session.user.id },
  });

  const desiredTags = formData.getAll("tags").map(String).filter(Boolean);
  for (const name of desiredTags) {
    await addTagToContact(contact.id, name);
  }

  await prisma.activityLogEntry.create({
    data: {
      contactId: contact.id,
      userId: session.user.id,
      message: t.actions.createdContact(session.user.name ?? ""),
    },
  });

  revalidatePath("/contacts");
  redirect(`/contacts/${contact.id}`);
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

  const existing = await prisma.contact.findFirst({
    where: { email: data.email, NOT: { id: contactId } },
  });
  if (existing) {
    return { error: t.actions.contactEmailExistsOther };
  }

  const updated = await prisma.contact.update({ where: { id: contactId }, data });

  const desiredTags = formData.getAll("tags").map(String).filter(Boolean);
  await syncContactTags(contactId, desiredTags);

  // Best-effort push back to systeme.io — never fails the CRM save itself.
  let warning = "";
  if (updated.systemeIoId) {
    try {
      const client = await getSystemeIoClient();
      if (client) {
        const fields: Record<string, string> = {};
        for (const [column, slug] of Object.entries(DEFAULT_PUSH_FIELD_SLUGS)) {
          const value = (data as Record<string, string | undefined>)[column];
          if (value) fields[slug] = value;
        }
        await client.updateContactFields(updated.systemeIoId, fields);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      warning = t.actions.contactUpdatedWarning(message);
    }
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return { success: `${t.actions.contactUpdated}${warning}` };
}

export async function deleteContact(contactId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await prisma.contact.delete({ where: { id: contactId } });
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function addTagToContact(contactId: string, tagName: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const name = tagName.trim();
  if (!name) return;

  const tag = await prisma.tag.upsert({
    where: { name },
    update: {},
    create: { name },
  });

  await prisma.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId: tag.id } },
    update: {},
    create: { contactId, tagId: tag.id },
  });

  // Best-effort push back to systeme.io — never fails the CRM save itself.
  try {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (contact?.systemeIoId) {
      const client = await getSystemeIoClient();
      if (client) {
        let systemeIoTagId = tag.systemeIoId;
        if (!systemeIoTagId) {
          const created = await client.createTag(tag.name);
          systemeIoTagId = created.id;
          await prisma.tag.update({ where: { id: tag.id }, data: { systemeIoId: created.id } });
        }
        await client.addTagToContact(contact.systemeIoId, systemeIoTagId);
      }
    }
  } catch {
    // Tag is still saved locally even if the systeme.io push fails.
  }

  revalidatePath(`/contacts/${contactId}`);
}

async function syncContactTags(contactId: string, desiredNames: string[]) {
  const current = await prisma.contactTag.findMany({ where: { contactId }, include: { tag: true } });
  const currentNames = new Set(current.map((ct) => ct.tag.name));
  const desiredSet = new Set(desiredNames);

  for (const name of desiredNames) {
    if (!currentNames.has(name)) {
      await addTagToContact(contactId, name);
    }
  }
  for (const ct of current) {
    if (!desiredSet.has(ct.tag.name)) {
      await removeTagFromContact(contactId, ct.tagId);
    }
  }
}

export async function removeTagFromContact(contactId: string, tagId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await prisma.contactTag.delete({
    where: { contactId_tagId: { contactId, tagId } },
  });

  // Best-effort push back to systeme.io — never fails the CRM save itself.
  try {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    const tag = await prisma.tag.findUnique({ where: { id: tagId } });
    if (contact?.systemeIoId && tag?.systemeIoId) {
      const client = await getSystemeIoClient();
      if (client) {
        await client.removeTagFromContact(contact.systemeIoId, tag.systemeIoId);
      }
    }
  } catch {
    // Non-fatal — the tag is still removed locally either way.
  }

  revalidatePath(`/contacts/${contactId}`);
}

export async function addContactNote(contactId: string, formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const message = String(formData.get("note") ?? "").trim();
  if (!message) return;

  await prisma.activityLogEntry.create({
    data: {
      contactId,
      userId: session.user.id,
      message: t.actions.addedNote(session.user.name ?? "", message),
    },
  });

  revalidatePath(`/contacts/${contactId}`);
}
