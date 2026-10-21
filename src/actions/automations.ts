"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { readExpiry, recordInVault } from "@/lib/api-key-expiry";
import { encryptSecret } from "@/lib/crypto";
import { runMakeSync } from "@/lib/automations";
import { getDict } from "@/lib/i18n/dictionaries";
import { requireAccess } from "@/lib/permissions";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage integrations");
  }
  return session;
}

export async function saveMakeApiKey(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  await requireAccess("marketing", "WRITE");
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const zone = String(formData.get("zone") ?? "").trim() || "us2.make.com";
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!apiKey) return { error: t.automations.makeKeyRequired };
  if (!teamId) return { error: t.automations.makeTeamIdRequired };
  const expiry = readExpiry(formData, session.user.language === "FR");
  if ("error" in expiry) return { error: expiry.error };

  const encrypted = await encryptSecret(apiKey);

  await withScopedPrismaClient(async (db) => {
    await db.integrationSetting.upsert({
      where: { provider: "make" },
      update: { apiKeyEncrypted: encrypted, apiKeyExpiresAt: expiry.expiresAt, apiKeyNoExpiry: expiry.noExpiry, metadata: { zone, teamId }, lastSyncStatus: null, lastSyncError: null },
      create: { provider: "make", apiKeyEncrypted: encrypted, apiKeyExpiresAt: expiry.expiresAt, apiKeyNoExpiry: expiry.noExpiry, metadata: { zone, teamId } },
    });
    await recordInVault(db, { source: "make", label: "Make API key", value: apiKey, expiry });
  });

  revalidatePath("/settings");
  return { success: t.automations.makeKeySaved };
}

export async function triggerMakeSync(): Promise<{ error?: string; success?: string }> {
  await requireAccess("marketing", "WRITE");
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  try {
    const result = await runMakeSync();
    revalidatePath("/settings");
    revalidatePath("/");
    return { success: t.automations.makeSynced(result.executionsSynced) };
  } catch (error) {
    const message = error instanceof Error ? error.message : t.automations.makeSyncFailed;
    return { error: message };
  }
}
