import { prisma } from "@/lib/prisma";

export const SOCIAL_PLATFORMS = ["facebook", "instagram", "linkedin", "youtube", "tiktok", "x"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// America/Montreal, not UTC — a sync run just after midnight UTC shouldn't
// get tagged with the previous Montreal day. Shared by every social
// analytics source (the Make webhook, the Buffer sync) so same-day runs
// land on the same row.
export function todaySocialDateKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" });
}

export interface SocialSnapshotView {
  platform: SocialPlatform;
  followers: number | null;
  followersDelta: number | null; // vs. the previous snapshot for this platform
  engagement: number | null;
  views: number | null;
  capturedAt: Date;
}

// One row per platform, each its own findFirst call — deliberately
// sequential (not Promise.all) for the same reason as every other
// dashboard query in src/app/(app)/page.tsx: Cloudflare Hyperdrive can't
// handle several fresh Prisma connections landing at once. Called once
// there, ahead of the concurrently-rendered Suspense cards, not from
// inside a card component itself.
export async function getLatestSocialSnapshots(): Promise<SocialSnapshotView[]> {
  const results: SocialSnapshotView[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const latest = await prisma.socialAnalyticsSnapshot.findFirst({
      where: { platform },
      orderBy: { capturedAt: "desc" },
    });
    if (!latest) continue;
    const previous = await prisma.socialAnalyticsSnapshot.findMany({
      where: { platform },
      orderBy: { capturedAt: "desc" },
      skip: 1,
      take: 1,
    });
    const prev = previous[0];
    results.push({
      platform,
      followers: latest.followers,
      followersDelta:
        latest.followers != null && prev?.followers != null ? latest.followers - prev.followers : null,
      engagement: latest.engagement,
      views: latest.views,
      capturedAt: latest.capturedAt,
    });
  }
  return results;
}
