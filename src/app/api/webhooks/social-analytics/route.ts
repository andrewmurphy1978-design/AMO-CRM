import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SOCIAL_PLATFORMS, todaySocialDateKey, type SocialPlatform } from "@/lib/social";

// Fed by the Make.com "Social Analytics Sync" scenario, which calls each
// platform's own insights API (Facebook Pages, Instagram Business,
// LinkedIn, YouTube — see the "Social Media Analytics" section in
// Settings for the connections it reuses) and POSTs the results here once
// a day with header `Authorization: Bearer $SOCIAL_ANALYTICS_WEBHOOK_SECRET`.
//
// Body is one snapshot object, or `{ "results": [snapshot, ...] }` for
// several platforms/bundles in a single call (the scenario aggregates all
// platforms into one HTTP step, and — for a platform with no single
// "total followers" field, like LinkedIn — a Make Iterator sends one
// bundle per underlying breakdown entry). Each snapshot is either
// { "platform": "instagram", "followers": 1234, "engagement": 56,
// "views": 789, "dateKey": "2026-09-16" } (a direct total) or
// { "platform": "linkedin", "organicFollowers": 5, "paidFollowers": 0,
// "iterationIndex": 1 } (a delta to add to the day's running total;
// iterationIndex 1 resets it instead, so a same-day re-run of the whole
// scenario doesn't double-count). "dateKey" defaults to today
// (America/Montreal) when omitted.
export async function POST(request: Request) {
  const secret = process.env.SOCIAL_ANALYTICS_WEBHOOK_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const snapshots = extractSnapshots(body);
  if (snapshots.length === 0) {
    return NextResponse.json({ error: "No valid snapshots in body" }, { status: 400 });
  }

  let saved = 0;
  for (const snapshot of snapshots) {
    const base = {
      engagement: snapshot.engagement,
      views: snapshot.views,
      raw: snapshot.raw as never,
      capturedAt: new Date(),
    };
    if (snapshot.followersDelta !== null) {
      // Fed one bundle per array entry by a Make Iterator (LinkedIn has no
      // single "total followers" field — see src/lib/social.ts). The first
      // bundle of each run (iterationIndex 1, or absent for a single-call
      // platform) resets the count; later bundles in the same run add to
      // it, so a same-day re-run doesn't double-count.
      if (snapshot.iterationIndex === null || snapshot.iterationIndex <= 1) {
        await prisma.socialAnalyticsSnapshot.upsert({
          where: { platform_dateKey: { platform: snapshot.platform, dateKey: snapshot.dateKey } },
          update: { followers: snapshot.followersDelta, ...base },
          create: { platform: snapshot.platform, dateKey: snapshot.dateKey, followers: snapshot.followersDelta, ...base },
        });
      } else {
        await prisma.socialAnalyticsSnapshot.upsert({
          where: { platform_dateKey: { platform: snapshot.platform, dateKey: snapshot.dateKey } },
          update: { followers: { increment: snapshot.followersDelta }, ...base },
          create: { platform: snapshot.platform, dateKey: snapshot.dateKey, followers: snapshot.followersDelta, ...base },
        });
      }
    } else {
      const data = { followers: snapshot.followers, ...base };
      await prisma.socialAnalyticsSnapshot.upsert({
        where: { platform_dateKey: { platform: snapshot.platform, dateKey: snapshot.dateKey } },
        update: data,
        create: { platform: snapshot.platform, dateKey: snapshot.dateKey, ...data },
      });
    }
    saved += 1;
  }

  return NextResponse.json({ ok: true, saved });
}

interface ParsedSnapshot {
  platform: SocialPlatform;
  dateKey: string;
  followers: number | null;
  followersDelta: number | null;
  iterationIndex: number | null;
  engagement: number | null;
  views: number | null;
  raw: Record<string, unknown>;
}

function extractSnapshots(body: unknown): ParsedSnapshot[] {
  if (!body || typeof body !== "object") return [];
  const obj = body as Record<string, unknown>;
  const rawList = Array.isArray(body) ? body : Array.isArray(obj.results) ? obj.results : [obj];

  const out: ParsedSnapshot[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const data = item as Record<string, unknown>;
    const platform = typeof data.platform === "string" ? data.platform.toLowerCase() : "";
    if (!SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) continue;

    const organic = toIntOrNull(data.organicFollowers);
    const paid = toIntOrNull(data.paidFollowers);
    const followersDelta = organic === null && paid === null ? null : (organic ?? 0) + (paid ?? 0);

    out.push({
      platform: platform as SocialPlatform,
      dateKey: typeof data.dateKey === "string" && data.dateKey ? data.dateKey : todaySocialDateKey(),
      followers: toIntOrNull(data.followers),
      followersDelta,
      iterationIndex: toIntOrNull(data.iterationIndex),
      engagement: toIntOrNull(data.engagement),
      views: toIntOrNull(data.views),
      raw: data,
    });
  }
  return out;
}

function toIntOrNull(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}
