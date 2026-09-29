"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { SOCIAL_PLATFORMS, SOCIAL_LANGUAGES, socialLinkKey } from "@/lib/social";
import { getDict } from "@/lib/i18n/dictionaries";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage integrations");
  }
  return session;
}

export async function saveSocialLinks(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const metadata: Record<string, string> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    for (const language of SOCIAL_LANGUAGES) {
      const key = socialLinkKey(platform, language);
      const value = String(formData.get(key) ?? "").trim();
      if (value) metadata[key] = value;
    }
  }

  await withScopedPrismaClient((db) =>
    db.integrationSetting.upsert({
      where: { provider: "social_links" },
      update: { metadata },
      create: { provider: "social_links", metadata },
    })
  );

  revalidatePath("/settings");
  revalidatePath("/social-analytics");
  return { success: t.settings.socialLinksSaved };
}
