import type { PrismaClient } from "@/lib/prisma";
import type { SocialPlatform } from "@/lib/social";

// The account each platform + language posts to, as used by the Make scenario "Social Media Poster": Facebook page ids,
// the Instagram business account (French) and Buffer profile ids (English Instagram, X), LinkedIn company ids. Anything
// not listed (TikTok, YouTube…) falls back to the Buffer channel id seen on that platform's posts, when there is one.
const KNOWN: Record<string, string> = {
  "facebook:EN": "1147530645108705",
  "facebook:FR": "1101384973063619",
  "instagram:EN": "6a3aef4f5ab6d2f106646dfc",
  "instagram:FR": "17841448839487858",
  "linkedin:EN": "118564089",
  "linkedin:FR": "118494242",
  "x:EN": "6a30adf938b55793459cff00",
  "x:FR": "6a30ae1f38b55793459cff49",
};

export async function getProfileIds(db: PrismaClient): Promise<Record<string, string>> {
  const seen = await db.socialPost.findMany({ distinct: ["platform", "language"], select: { platform: true, language: true, channelId: true } });
  const out: Record<string, string> = {};
  for (const p of seen) out[`${p.platform}:${p.language.toUpperCase()}`] = p.channelId;
  return { ...out, ...KNOWN };
}

export function profileId(ids: Record<string, string>, platform: SocialPlatform, language: "EN" | "FR"): string | null {
  return ids[`${platform}:${language}`] ?? null;
}
