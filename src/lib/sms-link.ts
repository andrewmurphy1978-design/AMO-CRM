import type { PrismaClient } from "@/lib/prisma";
import { toE164 } from "@/lib/phone-display";

// Attaches every still-unlinked text from one number to a contact, and saves
// the number on that contact if it isn't there yet so the next text from it
// is matched automatically. Shared by the SMS page's quick actions and the
// SMS dialog's "Linked to" contact picker.
export async function attachSmsNumberToContact(db: PrismaClient, number: string, contactId: string): Promise<void> {
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
}
