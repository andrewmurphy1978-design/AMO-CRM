"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { readExpiry, recordInVault } from "@/lib/api-key-expiry";
import { encryptSecret } from "@/lib/crypto";
import { runBufferSync } from "@/lib/buffer";
import { getDict } from "@/lib/i18n/dictionaries";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage integrations");
  }
  return session;
}

export async function saveBufferApiKey(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const provider = String(formData.get("provider") ?? "");
  if (!["buffer_en", "buffer_fr", "buffer_fb", "buffer_li"].includes(provider)) {
    return { error: "Invalid Buffer account" };
  }
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!apiKey) {
    return { error: t.settings.bufferKeyRequired };
  }
  const expiry = readExpiry(formData, session.user.language === "FR");
  if ("error" in expiry) return { error: expiry.error };

  const encrypted = await encryptSecret(apiKey);
  const labels: Record<string, string> = { buffer_en: "Buffer (English)", buffer_fr: "Buffer (French)", buffer_fb: "Buffer (Facebook)", buffer_li: "Buffer (LinkedIn)" };

  await withScopedPrismaClient(async (db) => {
    await db.integrationSetting.upsert({
      where: { provider },
      update: { apiKeyEncrypted: encrypted, apiKeyExpiresAt: expiry.expiresAt, apiKeyNoExpiry: expiry.noExpiry, lastSyncStatus: null, lastSyncError: null },
      create: { provider, apiKeyEncrypted: encrypted, apiKeyExpiresAt: expiry.expiresAt, apiKeyNoExpiry: expiry.noExpiry },
    });
    await recordInVault(db, { source: provider, label: `${labels[provider]} API key`, value: apiKey, expiry });
  });

  revalidatePath("/settings");
  return { success: t.settings.bufferKeySaved };
}

export async function triggerBufferSync(): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const result = await runBufferSync();
  revalidatePath("/settings");
  revalidatePath("/");
  if (result.accountErrors.length > 0) {
    return { error: result.accountErrors.map((e) => `${e.provider}: ${e.message}`).join(" | ") };
  }
  const warningSuffix = result.warnings.length > 0 ? ` (${result.warnings.join(" | ")})` : "";
  return { success: t.settings.bufferSynced(result.platformsSynced) + warningSuffix };
}
