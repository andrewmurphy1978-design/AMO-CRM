import type { PrismaClient } from "@/lib/prisma";

export const SOCIAL_PLATFORMS = ["facebook", "instagram", "linkedin", "tiktok", "x", "youtube"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_LANGUAGES = ["EN", "FR"] as const;
export type SocialLanguage = (typeof SOCIAL_LANGUAGES)[number];

// America/Montreal, not UTC — a sync run just after midnight UTC shouldn't
// get tagged with the previous Montreal day. Shared by every social
// analytics source (the Make webhook, the Buffer sync) so same-day runs
// land on the same row.
export function todaySocialDateKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" });
}

// Raw-JSON keys this app knows how to label and display beyond the three
// promoted columns (followers/engagement/views) — every source (Buffer,
// the Make webhook) stores whatever it actually got in "raw" regardless of
// this list, so a new metric type showing up here just needs a label
// added, not a schema change.
export const EXTRA_STAT_KEYS = [
  "postCount",
  "reactions",
  "comments",
  "reach",
  "impressions",
  "likes",
  "shares",
  "saves",
] as const;
export type ExtraStatKey = (typeof EXTRA_STAT_KEYS)[number];

export interface ExtraStat {
  key: ExtraStatKey;
  value: number;
}

export interface SocialSnapshotView {
  platform: SocialPlatform;
  language: SocialLanguage;
  followers: number | null;
  followersDelta: number | null; // vs. the previous snapshot for this platform+language
  engagement: number | null;
  views: number | null;
  extraStats: ExtraStat[];
  capturedAt: Date;
}

function extractExtraStats(raw: unknown): ExtraStat[] {
  if (!raw || typeof raw !== "object") return [];
  const data = raw as Record<string, unknown>;
  const out: ExtraStat[] = [];
  for (const key of EXTRA_STAT_KEYS) {
    const value = data[key];
    if (typeof value === "number") out.push({ key, value });
  }
  return out;
}

// One row per platform+language combo, each its own findMany (latest +
// previous in one call) — deliberately sequential (not Promise.all) for
// the same reason as every other dashboard query in src/app/(app)/page.tsx:
// Cloudflare Hyperdrive can't handle several fresh Prisma connections
// landing at once. Called once there, ahead of the concurrently-rendered
// Suspense cards, not from inside a card component itself.
export async function getLatestSocialSnapshots(db: PrismaClient): Promise<SocialSnapshotView[]> {
  const results: SocialSnapshotView[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    for (const language of SOCIAL_LANGUAGES) {
      const rows = await db.socialAnalyticsSnapshot.findMany({
        where: { platform, language },
        orderBy: { capturedAt: "desc" },
        take: 2,
      });
      const [latest, prev] = rows;
      if (!latest) continue;
      results.push({
        platform,
        language,
        followers: latest.followers,
        followersDelta:
          latest.followers != null && prev?.followers != null ? latest.followers - prev.followers : null,
        engagement: latest.engagement,
        views: latest.views,
        extraStats: extractExtraStats(latest.raw),
        capturedAt: latest.capturedAt,
      });
    }
  }
  return results;
}
