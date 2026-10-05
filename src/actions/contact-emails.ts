"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Every email address recorded on a contact (main, second, billing, extras), without duplicates.
export async function listContactEmails(contactId: string): Promise<string[]> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  return withScopedPrismaClient(async (db) => {
    const c = await db.contact.findUnique({ where: { id: contactId }, select: { email: true, email2: true, billingEmail: true, extraEmails: true } });
    if (!c) return [];
    return [...new Set([c.email, c.email2, c.billingEmail, ...c.extraEmails].filter((e): e is string => Boolean(e)))];
  });
}

// Adds an address to the contact's extra emails (kept as is if it is already there).
export async function addContactEmail(contactId: string, email: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const clean = email.trim();
  if (!EMAIL_RE.test(clean)) return { error: "Invalid email address." };
  await withScopedPrismaClient(async (db) => {
    const c = await db.contact.findUnique({ where: { id: contactId }, select: { email: true, email2: true, billingEmail: true, extraEmails: true } });
    if (!c) return;
    const have = [c.email, c.email2, c.billingEmail, ...c.extraEmails].filter(Boolean).map((e) => (e as string).toLowerCase());
    if (!have.includes(clean.toLowerCase())) await db.contact.update({ where: { id: contactId }, data: { extraEmails: [...c.extraEmails, clean] } });
  });
  revalidatePath(`/contacts/${contactId}`);
  return {};
}
