"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { toE164 } from "@/lib/phone-display";

async function requireSession() {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  return session;
}

function refresh(contactId?: string | null) {
  revalidatePath("/sms");
  revalidatePath("/", "layout"); // the sidebar's unread badge lives in the layout
  if (contactId) revalidatePath(`/contacts/${contactId}`);
}

// Marks incoming texts as looked at (drops them off the SMS page's "new"
// list and the sidebar badge).
export async function markSmsSeen(ids: string[]): Promise<void> {
  await requireSession();
  if (ids.length === 0) return;
  await withScopedPrismaClient((db) =>
    db.interaction.updateMany({ where: { id: { in: ids }, direction: "INBOUND", seenAt: null }, data: { seenAt: new Date() } })
  );
  refresh();
}

// Attaches every unlinked text from one number to an existing contact, and
// saves the number on that contact if it isn't there yet so the next text
// from it is matched automatically.
export async function linkSmsToContact(number: string, contactId: string): Promise<void> {
  await requireSession();
  await withScopedPrismaClient(async (db) => {
    const contact = await db.contact.findUniqueOrThrow({
      where: { id: contactId },
      select: { phone: true, phone2: true, extraPhones: true },
    });
    const known = [contact.phone, contact.phone2, ...contact.extraPhones].map((p) => (p ? toE164(p, "CA") : null));
    if (!known.includes(number)) {
      await db.contact.update({
        where: { id: contactId },
        data: !contact.phone ? { phone: number } : !contact.phone2 ? { phone2: number } : { extraPhones: { push: number } },
      });
    }
    const texts = await db.interaction.findMany({ where: { contactId: null, externalNumber: number }, select: { id: true } });
    for (const text of texts) {
      await db.interaction.update({ where: { id: text.id }, data: { contactId }, select: { id: true } });
      await db.interactionParticipant.create({ data: { interactionId: text.id, contactId } });
    }
  });
  refresh(contactId);
}

// Creates a new contact for an unknown number and links its texts to it.
export async function createContactFromSms(number: string, firstName: string, lastName: string): Promise<string> {
  await requireSession();
  const first = firstName.trim();
  const last = lastName.trim();
  const id = await withScopedPrismaClient(async (db) => {
    const contact = await db.contact.create({
      data: { firstName: first || null, lastName: last || (first ? null : number), phone: number, source: "Twilio SMS" },
      select: { id: true },
    });
    const texts = await db.interaction.findMany({ where: { contactId: null, externalNumber: number }, select: { id: true } });
    for (const text of texts) {
      await db.interaction.update({ where: { id: text.id }, data: { contactId: contact.id }, select: { id: true } });
      await db.interactionParticipant.create({ data: { interactionId: text.id, contactId: contact.id } });
    }
    return contact.id;
  });
  refresh(id);
  return id;
}
