"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { runSystemeIoSync } from "@/lib/sync";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage integrations");
  }
  return session;
}

export async function saveSystemeIoApiKey(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  await requireAdmin();
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!apiKey) {
    return { error: "API key is required." };
  }

  const encrypted = encryptSecret(apiKey);

  await prisma.integrationSetting.upsert({
    where: { provider: "systeme_io" },
    update: { apiKeyEncrypted: encrypted, lastSyncStatus: null, lastSyncError: null },
    create: { provider: "systeme_io", apiKeyEncrypted: encrypted },
  });

  revalidatePath("/settings");
  return { success: "systeme.io API key saved." };
}

export async function triggerSystemeIoSync(): Promise<{
  error?: string;
  success?: string;
  contactsSynced?: number;
  tagsSynced?: number;
}> {
  await requireAdmin();
  try {
    const result = await runSystemeIoSync();
    revalidatePath("/settings");
    revalidatePath("/contacts");
    return {
      success: `Synced ${result.contactsSynced} contacts and ${result.tagsSynced} tags.`,
      ...result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
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
