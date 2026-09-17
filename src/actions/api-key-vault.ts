"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { getDict } from "@/lib/i18n/dictionaries";

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
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const label = String(formData.get("label") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!label || !value) {
    return { error: t.apiVault.fieldsRequired };
  }

  const valueEncrypted = await encryptSecret(value);
  await prisma.apiKeyVaultEntry.create({
    data: { label, valueEncrypted, notes: notes || null },
  });

  revalidatePath("/settings");
  return { success: t.apiVault.saved };
}

export async function deleteVaultEntry(id: string): Promise<void> {
  await requireAdmin();
  await prisma.apiKeyVaultEntry.delete({ where: { id } });
  revalidatePath("/settings");
}

// Decrypts on demand rather than shipping every entry's plaintext to the
// client on page load — the value only ever leaves the server when the
// admin explicitly clicks "Reveal" for that one entry.
export async function revealVaultEntry(id: string): Promise<{ value?: string; error?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const entry = await prisma.apiKeyVaultEntry.findUnique({ where: { id } });
  if (!entry) return { error: t.apiVault.notFound };
  const value = await decryptSecret(entry.valueEncrypted);
  return { value };
}
