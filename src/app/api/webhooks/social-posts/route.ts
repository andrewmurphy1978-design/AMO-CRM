import { NextResponse } from "next/server";
import { withScopedPrismaClient } from "@/lib/prisma";

// Fed by the Make "YouTube Sync (EN + FR)" scenario once a day, with header
// `Authorization: Bearer $SOCIAL_ANALYTICS_WEBHOOK_SECRET` (same secret as the followers webhook). Body:
// { "language": "EN" | "FR", "videos": <YouTube Data API videos.list response, or just its items array> }.
// Public videos are saved as SENT posts; private videos with a future publishAt (what the Shorts poster uploads) as
// QUEUED posts. Queued posts YouTube no longer lists (published or removed) are dropped, like Buffer's.
interface YtVideo {
  id?: string;
  snippet?: { title?: string; description?: string; publishedAt?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  status?: { privacyStatus?: string; publishAt?: string };
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v !== undefined && v !== null && v !== "" && Number.isFinite(n) ? n : null;
};

export async function POST(request: Request) {
  const secret = process.env.SOCIAL_ANALYTICS_WEBHOOK_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { language?: string; videos?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const language = String(body.language ?? "").toUpperCase() === "FR" ? "FR" : "EN";
  const raw = body.videos;
  const items: YtVideo[] = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown } | null)?.items) ? ((raw as { items: YtVideo[] }).items) : [];

  const provider = `youtube_${language.toLowerCase()}`;
  const channelId = provider;
  const now = Date.now();
  const saved = await withScopedPrismaClient(async (db) => {
    const queuedSeen: string[] = [];
    let count = 0;
    for (const v of items) {
      if (!v.id) continue;
      const publishAt = v.status?.publishAt ? new Date(v.status.publishAt) : null;
      const scheduled = v.status?.privacyStatus === "private" && publishAt !== null && publishAt.getTime() > now;
      const isPublic = v.status?.privacyStatus === "public" || (v.status?.privacyStatus === "unlisted");
      if (!scheduled && !isPublic) continue; // private drafts are not posts
      const postedAt = scheduled ? publishAt : v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null;
      const metrics: Record<string, number> = {};
      for (const [k, val] of [["views", v.statistics?.viewCount], ["likes", v.statistics?.likeCount], ["comments", v.statistics?.commentCount]] as const) {
        const n = num(val);
        if (n !== null) metrics[k] = n;
      }
      const data = {
        channelId,
        platform: "youtube",
        language,
        status: scheduled ? "QUEUED" : "SENT",
        text: v.snippet?.title ?? null,
        link: scheduled ? null : `https://www.youtube.com/watch?v=${v.id}`,
        postedAt,
        metrics: metrics as never,
        fetchedAt: new Date(),
      };
      await db.socialPost.upsert({ where: { provider_bufferId: { provider, bufferId: v.id } }, update: data, create: { provider, bufferId: v.id, ...data } });
      if (scheduled) queuedSeen.push(v.id);
      count += 1;
    }
    await db.socialPost.deleteMany({ where: { provider, status: "QUEUED", bufferId: { notIn: queuedSeen } } });
    return count;
  });
  return NextResponse.json({ ok: true, saved });
}
