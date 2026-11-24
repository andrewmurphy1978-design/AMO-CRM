import { NextResponse } from "next/server";
import { withScopedPrismaClient } from "@/lib/prisma";
import { SOCIAL_PLATFORMS } from "@/lib/social";
import { receiveVideoHandoff } from "@/lib/social-videos";

// The weekly Claude scheduled task calls this when it finishes (Authorization: Bearer $SOCIAL_ANALYTICS_WEBHOOK_SECRET):
// { "weekStart": "2026-10-26", "status": "success", "posts": [{ "platform": "facebook", "language": "EN", "count": 5, "via": "make" }],
//   "errors": ["…"], "note": "…" }
// "via" is "buffer", "make" or "both". The Social Media > Posts tab compares it with what is really queued.
//
// The same endpoint (same secret, same Make scenario 7162497) takes the rendered TikTok videos at the end of the task's
// Part 1, with "type": "video-approval" — they wait in Social Media for Andrew's approval, and the CRM schedules them
// itself once approved (see src/lib/social-videos.ts for the body format).
export async function POST(request: Request) {
  const secret = process.env.SOCIAL_ANALYTICS_WEBHOOK_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const weekStart = typeof body?.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart) ? body.weekStart : null;
  if (!body || !weekStart) return NextResponse.json({ error: "weekStart (YYYY-MM-DD, the Monday the posts start) is required" }, { status: 400 });

  if (body.type === "video-approval") {
    const result = await withScopedPrismaClient((db) => receiveVideoHandoff(db, body, weekStart));
    const ok = result.received > 0 || (result.errors.length === 0 && result.skipped.length > 0);
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 400 });
  }

  const posts = (Array.isArray(body.posts) ? body.posts : [])
    .map((p) => p as Record<string, unknown>)
    .filter((p) => typeof p.platform === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(p.platform.toLowerCase()))
    .map((p) => ({
      platform: String(p.platform).toLowerCase(),
      language: typeof p.language === "string" ? p.language.toUpperCase() : null,
      count: Number.isFinite(Number(p.count)) ? Number(p.count) : 0,
      via: ["buffer", "make", "both"].includes(String(p.via)) ? String(p.via) : null,
    }));
  const errors = Array.isArray(body.errors) ? body.errors.map(String).slice(0, 20) : [];
  const status = body.status === "error" || errors.length > 0 ? "error" : "success";

  await withScopedPrismaClient((db) =>
    db.socialWeeklyRun.create({
      data: { weekStart: new Date(`${weekStart}T00:00:00Z`), status, posts: posts as never, errors: errors as never, note: typeof body.note === "string" ? body.note.slice(0, 2000) : null },
    })
  );
  return NextResponse.json({ ok: true, posts: posts.length });
}
