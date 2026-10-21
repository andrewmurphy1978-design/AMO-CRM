"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { getDict } from "@/lib/i18n/dictionaries";
import { readExpiry } from "@/lib/api-key-expiry";
import { requireAccess } from "@/lib/permissions";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage the API key vault");
  }
  return session;
}

export async function addVaultEntry(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  await requireAccess("settings", "WRITE");
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const label = String(formData.get("label") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!label || !value) {
    return { error: t.apiVault.fieldsRequired };
  }
  const expiry = readExpiry(formData, session.user.language === "FR");
  if ("error" in expiry) return { error: expiry.error };

  const valueEncrypted = await encryptSecret(value);
  await withScopedPrismaClient((db) =>
    db.apiKeyVaultEntry.create({
      data: { label, valueEncrypted, notes: notes || null, expiresAt: expiry.expiresAt, noExpiry: expiry.noExpiry },
    })
  );

  revalidatePath("/settings");
  return { success: t.apiVault.saved };
}

// Renewing or correcting a key's expiry date without pasting the key again.
export async function updateVaultExpiry(id: string, formData: FormData): Promise<{ error?: string }> {
  await requireAccess("settings", "WRITE");
  const session = await requireAdmin();
  const expiry = readExpiry(formData, session.user.language === "FR");
  if ("error" in expiry) return { error: expiry.error };
  await withScopedPrismaClient(async (db) => {
    const entry = await db.apiKeyVaultEntry.update({ where: { id }, data: { expiresAt: expiry.expiresAt, noExpiry: expiry.noExpiry } });
    // An entry saved from a Settings key form keeps that integration's own expiry in step.
    if (entry.source) {
      await db.integrationSetting.updateMany({ where: { provider: entry.source }, data: { apiKeyExpiresAt: expiry.expiresAt, apiKeyNoExpiry: expiry.noExpiry } });
    }
  });
  revalidatePath("/settings");
  return {};
}

export async function deleteVaultEntry(id: string): Promise<void> {
  await requireAccess("settings", "DELETE");
  await requireAdmin();
  await withScopedPrismaClient((db) => db.apiKeyVaultEntry.delete({ where: { id } }));
  revalidatePath("/settings");
}

// Decrypts on demand rather than shipping every entry's plaintext to the
// client on page load — the value only ever leaves the server when the
// admin explicitly clicks "Reveal" for that one entry.
export async function revealVaultEntry(id: string): Promise<{ value?: string; error?: string }> {
  await requireAccess("settings", "WRITE");
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const entry = await withScopedPrismaClient((db) => db.apiKeyVaultEntry.findUnique({ where: { id } }));
  if (!entry) return { error: t.apiVault.notFound };
  const value = await decryptSecret(entry.valueEncrypted);
  return { value };
}
