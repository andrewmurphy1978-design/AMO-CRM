"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { getDict } from "@/lib/i18n/dictionaries";

// Same admin-only, decrypt-on-demand pattern as the global API key vault
// (see api-key-vault.ts) — these are login credentials for a client's own
// web-based tools (hosting panel, domain registrar, WordPress admin, etc.),
// scoped to one contact instead of being account-wide.
async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage stored credentials");
  }
  return session;
}

export async function addContactCredential(
  contactId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const label = String(formData.get("label") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!label) {
    return { error: t.contactCredentials.labelRequired };
  }

  const passwordEncrypted = password ? await encryptSecret(password) : null;
  await withScopedPrismaClient((db) =>
    db.contactCredential.create({
      data: { contactId, label, url: url || null, username: username || null, passwordEncrypted, notes: notes || null },
    })
  );

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath(`/contacts/${contactId}/edit`);
  return { success: t.contactCredentials.saved };
}

export async function deleteContactCredential(contactId: string, id: string): Promise<void> {
  await requireAdmin();
  await withScopedPrismaClient((db) => db.contactCredential.delete({ where: { id } }));
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath(`/contacts/${contactId}/edit`);
}

// Decrypts on demand rather than shipping every entry's plaintext to the
// client on page load — the password only ever leaves the server when the
// admin explicitly clicks "Reveal" for that one entry.
export async function revealContactCredential(id: string): Promise<{ value?: string; error?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const entry = await withScopedPrismaClient((db) => db.contactCredential.findUnique({ where: { id } }));
  if (!entry?.passwordEncrypted) return { error: t.contactCredentials.notFound };
  const value = await decryptSecret(entry.passwordEncrypted);
  return { value };
}
