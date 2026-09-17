"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { runSystemeIoSync } from "@/lib/sync";
import { disconnectGoogle } from "@/lib/google";
import { getDict } from "@/lib/i18n/dictionaries";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage integrations");
  }
  return session;
}

// The Anthropic API key that powers the Email page's importance screening
// (see src/lib/email-classifier.ts) expires periodically — storing it here
// (encrypted, like every other integration key) instead of only as a
// Cloudflare secret means rotating it is a Settings-page paste, not a
// terminal command each time.
export async function saveAnthropicApiKey(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!apiKey) {
    return { error: t.anthropicKey.keyRequired };
  }

  const encrypted = await encryptSecret(apiKey);

  await prisma.integrationSetting.upsert({
    where: { provider: "anthropic" },
    update: { apiKeyEncrypted: encrypted },
    create: { provider: "anthropic", apiKeyEncrypted: encrypted },
  });

  revalidatePath("/settings");
  return { success: t.anthropicKey.keySaved };
}

export async function saveSystemeIoApiKey(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!apiKey) {
    return { error: t.actions.systemeioKeyRequired };
  }

  const encrypted = await encryptSecret(apiKey);

  await prisma.integrationSetting.upsert({
    where: { provider: "systeme_io" },
    update: { apiKeyEncrypted: encrypted, lastSyncStatus: null, lastSyncError: null },
    create: { provider: "systeme_io", apiKeyEncrypted: encrypted },
  });

  revalidatePath("/settings");
  return { success: t.actions.systemeioKeySaved };
}

export async function triggerSystemeIoSync(): Promise<{
  error?: string;
  success?: string;
  contactsSynced?: number;
  tagsSynced?: number;
  subscriptionsSynced?: number;
  enrollmentsSynced?: number;
  membershipsSynced?: number;
  campaignsSynced?: number;
  automationsSynced?: number;
  bookingsSynced?: number;
}> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  try {
    const result = await runSystemeIoSync();
    revalidatePath("/settings");
    revalidatePath("/contacts");
    revalidatePath("/marketing");
    revalidatePath("/bookings");
    const otherSynced =
      result.subscriptionsSynced + result.enrollmentsSynced + result.membershipsSynced +
      result.campaignsSynced + result.automationsSynced + result.bookingsSynced;
    return {
      success: t.actions.systemeioSynced(result.contactsSynced, result.tagsSynced, otherSynced),
      ...result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : t.actions.systemeioSyncFailed;
    return { error: message };
  }
}

export async function toggleAutoSync(enabled: boolean) {
  await requireAdmin();
  await prisma.integrationSetting.upsert({
    where: { provider: "systeme_io" },
    update: { autoSyncEnabled: enabled },
    create: { provider: "systeme_io", autoSyncEnabled: enabled },
  });
  revalidatePath("/settings");
}

export async function saveAutoSyncTime(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const time = String(formData.get("autoSyncTime") ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { error: t.actions.scheduleInvalidTime };
  }

  await prisma.integrationSetting.upsert({
    where: { provider: "systeme_io" },
    update: { autoSyncTime: time },
    create: { provider: "systeme_io", autoSyncTime: time },
  });

  revalidatePath("/settings");
  return { success: t.actions.scheduleSaved };
}

// Google is a personal, per-user connection (unlike the org-wide
// integrations above), so any signed-in user can disconnect their own —
// no admin check.
export async function disconnectGoogleAccount(): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
  await disconnectGoogle(session.user.id);
  revalidatePath("/settings");
  revalidatePath("/");
}
