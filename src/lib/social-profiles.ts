import type { PrismaClient } from "@/lib/prisma";
import type { SocialPlatform } from "@/lib/social";

// The username shown on each Summary card. Buffer's channel usernames are saved on every refresh from Buffer
// (setting "social_channels"); the Instagram account Make publishes to directly (French) is known from its scenario.
const KNOWN: Record<string, string> = {
  "instagram:FR": "andrewmurphyonline.fr",
};

export async function getProfileNames(db: PrismaClient): Promise<Record<string, string>> {
  const saved = await db.integrationSetting.findUnique({ where: { provider: "social_channels" } });
  return { ...KNOWN, ...((saved?.metadata as Record<string, string> | null) ?? {}) };
}

// Social handles read as @name; a Facebook page or LinkedIn company keeps its name as is.
export function profileName(names: Record<string, string>, platform: SocialPlatform, language: "EN" | "FR"): string | null {
  const raw = names[`${platform}:${language}`];
  if (!raw) return null;
  if (["instagram", "x", "tiktok", "youtube"].includes(platform) && !/\s/.test(raw) && !raw.startsWith("@")) return `@${raw}`;
  return raw;
}
