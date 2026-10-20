import type { PrismaClient } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
export { expiryState, type ExpiryInfo, type ExpiryState } from "@/lib/api-key-expiry-shared";

// Every time an API key is pasted in Settings its expiry date is asked for (or "doesn't expire"), and the
// key is saved in the API vault too — see recordInVault. These helpers are shared by every key form.

export interface KeyExpiry {
  expiresAt: Date | null;
  noExpiry: boolean;
}

/** Reads the expiry fields of a key form; an error message when a new key comes without either. */
export function readExpiry(formData: FormData, fr: boolean): KeyExpiry | { error: string } {
  const noExpiry = formData.get("noExpiry") === "on";
  const raw = String(formData.get("expiresAt") ?? "").trim();
  if (noExpiry) return { expiresAt: null, noExpiry: true };
  if (!raw) return { error: fr ? "Indiquez la date d'expiration de la clé (ou cochez « n'expire pas »)." : "Enter the key's expiry date (or tick \"doesn't expire\")." };
  const date = new Date(`${raw}T23:59:59`);
  if (Number.isNaN(date.getTime())) return { error: fr ? "Date d'expiration invalide." : "Invalid expiry date." };
  return { expiresAt: date, noExpiry: false };
}

/** Saves (or, for a renewed key, updates) the key's entry in the API vault. */
export async function recordInVault(db: PrismaClient, entry: { source: string; label: string; value: string; expiry: KeyExpiry; notes?: string }): Promise<void> {
  const valueEncrypted = await encryptSecret(entry.value);
  const fields = { label: entry.label, valueEncrypted, expiresAt: entry.expiry.expiresAt, noExpiry: entry.expiry.noExpiry };
  await db.apiKeyVaultEntry.upsert({
    where: { source: entry.source },
    update: fields,
    create: { ...fields, source: entry.source, notes: entry.notes ?? "Saved automatically from Settings" },
  });
}
