import { cache } from "react";
import { withScopedPrismaClient } from "@/lib/prisma";
import { makeClientWith } from "@/lib/automations";
import { daysAgo, type SocialPlatform } from "@/lib/social";
import { BASE, MAKE_FAILED_STORE_ID, MAKE_QUEUE_STORE_ID } from "@/lib/social-weekly";

export interface OverviewPost {
  id: string;
  platform: SocialPlatform;
  language: "EN" | "FR";
  postedAt: Date | null;
  text: string | null;
  source: "buffer" | "make";
}

export interface PostsOverview {
  queued: OverviewPost[]; // soonest first
  sent: OverviewPost[]; // last 28 days, newest first
  makeQueued: number;
  bufferQueued: number;
  sentLast7: number;
  sentLast28: number;
  failedInMake: number | null;
  makeError: string | null;
}

// What the Dashboard's Post Summary and Post Details cards show: what waits in Make's "Social Post Queue" (Facebook,
// LinkedIn, French Instagram and X, which Make publishes or hands to Buffer when due) plus Buffer's own queue, and what
// Buffer sent in the last four weeks. Read once per request, so the two cards (and their desktop / mobile copies) share it.
export const getPostsOverview = cache(async (): Promise<PostsOverview> => {
  return withScopedPrismaClient(async (db) => {
    const since7 = daysAgo(7);
    const [rows, make] = await Promise.all([
      db.socialPost.findMany({
        where: { OR: [{ status: "QUEUED" }, { status: "SENT", postedAt: { gte: daysAgo(28) } }] },
        orderBy: { postedAt: "desc" },
        select: { id: true, platform: true, language: true, status: true, postedAt: true, text: true },
        take: 2000,
      }),
      (async () => {
        try {
          const client = await makeClientWith(db);
          if (!client) throw new Error("Make is not connected in Settings");
          const [queue, failed] = await Promise.all([client.listDataStoreRecords(MAKE_QUEUE_STORE_ID), client.listDataStoreRecords(MAKE_FAILED_STORE_ID)]);
          const items: OverviewPost[] = [];
          for (const r of queue) {
            const platform = BASE[String(r.data.platform ?? "").toLowerCase()];
            if (!platform || platform === "tiktok") continue; // TikTok leaves the queue at once (Google Sheet)
            const language = String(r.data.language ?? "").toUpperCase() === "FR" ? "FR" : "EN";
            if (platform === "instagram" && language === "EN") continue; // English Instagram goes through Buffer
            const when = r.data.scheduled_time ? new Date(String(r.data.scheduled_time)) : null;
            items.push({ id: `make-${r.key}`, platform, language, postedAt: when && !Number.isNaN(when.getTime()) ? when : null, text: r.data.message ? String(r.data.message) : null, source: "make" });
          }
          return { items, failed: failed.length, error: null as string | null };
        } catch (e) {
          return { items: [] as OverviewPost[], failed: null as number | null, error: e instanceof Error ? e.message : String(e) };
        }
      })(),
    ]);

    const toPost = (p: (typeof rows)[number]): OverviewPost => ({
      id: p.id,
      platform: p.platform as SocialPlatform,
      language: p.language.toUpperCase() === "FR" ? "FR" : "EN",
      postedAt: p.postedAt,
      text: p.text,
      source: "buffer",
    });
    const t = (p: OverviewPost) => p.postedAt?.getTime() ?? 0;
    const bufferQueued = rows.filter((r) => r.status === "QUEUED").map(toPost);
    const sent = rows.filter((r) => r.status === "SENT").map(toPost).sort((a, b) => t(b) - t(a));
    return {
      queued: [...bufferQueued, ...make.items].sort((a, b) => t(a) - t(b)),
      sent,
      makeQueued: make.items.length,
      bufferQueued: bufferQueued.length,
      sentLast7: sent.filter((p) => (p.postedAt?.getTime() ?? 0) >= since7.getTime()).length,
      sentLast28: sent.length,
      failedInMake: make.failed,
      makeError: make.error,
    };
  });
});
