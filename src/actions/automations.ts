"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { runMakeSync } from "@/lib/automations";
import { getDict } from "@/lib/i18n/dictionaries";

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
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const zone = String(formData.get("zone") ?? "").trim() || "us2.make.com";
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!apiKey) return { error: t.automations.makeKeyRequired };
  if (!teamId) return { error: t.automations.makeTeamIdRequired };

  const encrypted = await encryptSecret(apiKey);

  await withScopedPrismaClient((db) =>
    db.integrationSetting.upsert({
      where: { provider: "make" },
      update: { apiKeyEncrypted: encrypted, metadata: { zone, teamId }, lastSyncStatus: null, lastSyncError: null },
      create: { provider: "make", apiKeyEncrypted: encrypted, metadata: { zone, teamId } },
    })
  );

  revalidatePath("/settings");
  return { success: t.automations.makeKeySaved };
}

export async function triggerMakeSync(): Promise<{ error?: string; success?: string }> {
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
