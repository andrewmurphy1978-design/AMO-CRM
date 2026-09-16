"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  const encrypted = await encryptSecret(apiKey);

  await prisma.integrationSetting.upsert({
    where: { provider },
    update: { apiKeyEncrypted: encrypted, lastSyncStatus: null, lastSyncError: null },
    create: { provider, apiKeyEncrypted: encrypted },
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
