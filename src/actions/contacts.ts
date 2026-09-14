"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ContactSchema = z.object({
  email: z.string().email("A valid email is required"),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  company: z.string().trim().optional(),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
  stage: z.enum(["LEAD", "PROSPECT", "CLIENT", "PAST_CLIENT", "UNSUBSCRIBED"]),
  notes: z.string().trim().optional(),
});

function readContactForm(formData: FormData) {
  const raw = {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    firstName: String(formData.get("firstName") ?? "").trim() || undefined,
    lastName: String(formData.get("lastName") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    company: String(formData.get("company") ?? "").trim() || undefined,
    city: String(formData.get("city") ?? "").trim() || undefined,
    country: String(formData.get("country") ?? "").trim() || undefined,
    stage: String(formData.get("stage") ?? "LEAD"),
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  };
  return ContactSchema.parse(raw);
}

export async function createContact(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  let data;
  try {
    data = readContactForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Invalid input" };
    }
    throw error;
  }

  const existing = await prisma.contact.findUnique({ where: { email: data.email } });
  if (existing) {
    return { error: "A contact with this email already exists." };
  }

  const contact = await prisma.contact.create({
    data: { ...data, source: "manual", ownerId: session.user.id },
  });

  await prisma.activityLogEntry.create({
    data: {
      contactId: contact.id,
      userId: session.user.id,
      message: `${session.user.name} created this contact.`,
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

  let data;
  try {
    data = readContactForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Invalid input" };
    }
    throw error;
  }

  const existing = await prisma.contact.findFirst({
    where: { email: data.email, NOT: { id: contactId } },
  });
  if (existing) {
    return { error: "Another contact already uses this email." };
  }

  await prisma.contact.update({ where: { id: contactId }, data });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return { success: "Contact updated." };
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

  revalidatePath(`/contacts/${contactId}`);
}

export async function removeTagFromContact(contactId: string, tagId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await prisma.contactTag.delete({
    where: { contactId_tagId: { contactId, tagId } },
  });

  revalidatePath(`/contacts/${contactId}`);
}

export async function addContactNote(contactId: string, formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const message = String(formData.get("note") ?? "").trim();
  if (!message) return;

  await prisma.activityLogEntry.create({
    data: {
      contactId,
      userId: session.user.id,
      message: `${session.user.name}: ${message}`,
    },
  });

  revalidatePath(`/contacts/${contactId}`);
}
