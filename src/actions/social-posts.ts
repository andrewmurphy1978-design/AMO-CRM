"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";
import { syncBufferPosts, describeBufferSchema, describeBufferPosts } from "@/lib/buffer-posts";
import { runMakeSync } from "@/lib/automations";
import { SOCIAL_LANGUAGES, todaySocialDateKey } from "@/lib/social";

/** Reads the latest sent and queued posts from Buffer into the CRM. */
export async function refreshSocialPostsAction(): Promise<{ saved: number; errors: string[]; channels: { name: string; platform: string; language: string; sent: number; queued: number; error?: string }[] }> {
  await requireAccess("socialAnalytics", "READ");
  const result = await withScopedPrismaClient((db) => syncBufferPosts(db));
  // Also bring in the latest Make runs, which the weekly check reads (not configured / unreachable is fine).
  await runMakeSync().catch(() => undefined);
  revalidatePath("/social-analytics");
  return result;
}

/** Admin only: the parts of Buffer's live schema that posts depend on, to see what Buffer really offers. */
export async function inspectBufferSchemaAction(): Promise<{ text: string } | { error: string }> {
  await requireAccess("socialAnalytics", "READ");
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Only admins can run this check." };
  try {
    return { text: await withScopedPrismaClient((db) => describeBufferSchema(db)) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const MANUAL_PLATFORMS = ["x", "tiktok", "youtube"] as const;

/** Today's follower counts typed in by hand, for platforms no automation can read (X, TikTok, YouTube). */
export async function saveManualFollowersAction(
  entries: { platform: string; language: string; followers: number | null }[],
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  await requireAccess("socialAnalytics", "WRITE");
  const dateKey = todaySocialDateKey();
  let saved = 0;
  await withScopedPrismaClient(async (db) => {
    for (const e of entries) {
      const platform = e.platform.toLowerCase();
      const language = e.language.toUpperCase();
      if (!(MANUAL_PLATFORMS as readonly string[]).includes(platform)) continue;
      if (!(SOCIAL_LANGUAGES as readonly string[]).includes(language)) continue;
      if (e.followers === null || !Number.isFinite(e.followers) || e.followers < 0) continue;
      const followers = Math.round(e.followers);
      await db.socialAnalyticsSnapshot.upsert({
        where: { platform_language_dateKey: { platform, language, dateKey } },
        update: { followers, capturedAt: new Date() },
        create: { platform, language, dateKey, followers, raw: { source: "manual" } },
      });
      saved += 1;
    }
  });
  revalidatePath("/social-analytics");
  return { ok: true, saved };
}

/** Admin only: what Buffer returns per channel with and without the "sent" filter (to see why posts are missing). */
export async function inspectBufferPostsAction(): Promise<{ text: string } | { error: string }> {
  await requireAccess("socialAnalytics", "READ");
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Only admins can run this check." };
  try {
    return { text: await withScopedPrismaClient((db) => describeBufferPosts(db)) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
