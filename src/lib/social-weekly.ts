import type { PrismaClient } from "@/lib/prisma";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social";
import { makeClientWith } from "@/lib/automations";

// "Did next week's posts get made and queued?" — compares what the weekly Claude task reported with what is really
// waiting to be published. How posts are published (read from the Make scenario "Social Media Poster", which runs every
// 30 minutes and works through the Make data store "Social Post Queue"):
//  - Facebook, LinkedIn, X, Instagram (French, carousel, story): held in the Make queue until their scheduled time, then
//    published by Make (X is handed to Buffer "now" at that moment, so it never waits in Buffer's own queue).
//  - Instagram (English): handed to Buffer straight away with its scheduled time, so it waits in Buffer's queue.
//  - TikTok: written to a Google Sheet as "pending" and not posted by Make; it leaves the Make queue at once, so only the
//    Thursday report can confirm it.
// Posts that fail on the Facebook / LinkedIn photo routes are kept in the Make data store "Failed Social Posts".

export const MAKE_QUEUE_STORE_ID = 108624;
export const MAKE_FAILED_STORE_ID = 114391;

const BASE: Record<string, SocialPlatform> = {
  facebook: "facebook", "facebook-photo": "facebook",
  linkedin: "linkedin", "linkedin-photo": "linkedin",
  x: "x",
  instagram: "instagram", "instagram-carousel": "instagram", "instagram-story": "instagram",
  tiktok: "tiktok",
};

export interface WeeklyRow {
  platform: SocialPlatform;
  expected: number | null; // from the report
  makeQueued: number | null; // waiting in the Make queue for the week (null = not read)
  bufferQueued: number;
  unverifiable: boolean;
  ok: boolean | null;
  problem: string | null;
}

export interface WeeklyCheck {
  weekStart: string;
  report: { reportedAt: string; status: string; note: string | null; errors: string[] } | null;
  reportMissing: boolean;
  rows: WeeklyRow[];
  makeError: string | null;
  failedInMake: number | null;
}

const DAY = 86_400_000;

function montreal(now: Date): { weekday: number; hour: number; ymd: string } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montreal", weekday: "short", hour: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), hour: Number(get("hour")) % 24, ymd: `${get("year")}-${get("month")}-${get("day")}` };
}

export async function getWeeklyCheck(db: PrismaClient): Promise<WeeklyCheck> {
  const m = montreal(new Date());
  const today = new Date(`${m.ymd}T00:00:00Z`);
  // The Monday the next batch of posts starts (the Thursday task prepares it): always a future Monday.
  const monday = new Date(today.getTime() + (((8 - m.weekday) % 7) || 7) * DAY);
  const weekEnd = new Date(monday.getTime() + 7 * DAY);
  const weekStart = monday.toISOString().slice(0, 10);

  const run = await db.socialWeeklyRun.findFirst({ where: { weekStart: monday }, orderBy: { reportedAt: "desc" } });
  const afterThursdayNoon = m.weekday >= 5 || m.weekday === 0 || (m.weekday === 4 && m.hour >= 12);
  const reportMissing = !run && afterThursdayNoon;
  const reported = (run?.posts as { platform: SocialPlatform; count: number }[] | null) ?? [];

  // Waiting in the Make queue
  const makeQueued = new Map<SocialPlatform, number>();
  let makeError: string | null = null;
  let failedInMake: number | null = null;
  try {
    const client = await makeClientWith(db);
    if (!client) throw new Error("Make is not connected in Settings");
    const records = await client.listDataStoreRecords(MAKE_QUEUE_STORE_ID);
    for (const r of records) {
      const base = BASE[String(r.data.platform ?? "").toLowerCase()];
      const when = r.data.scheduled_time ? new Date(String(r.data.scheduled_time)) : null;
      if (!base || !when || Number.isNaN(when.getTime()) || when < monday || when >= weekEnd) continue;
      makeQueued.set(base, (makeQueued.get(base) ?? 0) + 1);
    }
    failedInMake = (await client.listDataStoreRecords(MAKE_FAILED_STORE_ID)).length;
  } catch (e) {
    makeError = e instanceof Error ? e.message : String(e);
  }

  // Waiting in Buffer's own queue
  const queued = await db.socialPost.groupBy({ by: ["platform"], where: { status: "QUEUED", postedAt: { gte: monday, lt: weekEnd } }, _count: { _all: true } });
  const bufferQueued = new Map(queued.map((q) => [q.platform, q._count._all]));

  const rows: WeeklyRow[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    if (platform === "youtube" && !reported.some((r) => r.platform === platform)) continue;
    const exp = reported.filter((r) => r.platform === platform);
    const expected = exp.length ? exp.reduce((s, r) => s + (r.count || 0), 0) : null;
    const unverifiable = platform === "tiktok";
    const make = makeError ? null : (makeQueued.get(platform) ?? 0);
    const buf = bufferQueued.get(platform) ?? 0;
    const total = (make ?? 0) + buf;
    let ok: boolean | null = true;
    let problem: string | null = null;
    if (unverifiable) {
      // TikTok posts go to a Google Sheet and leave the Make queue at once, so only the Thursday report can vouch for them.
      if (expected) {
        problem = `${expected} sent to the TikTok Google Sheet according to Claude's report (the Sheet itself is not read here)`;
      } else {
        ok = null;
        problem = "TikTok posts are written to a Google Sheet, so only the Thursday report can confirm them";
      }
    } else if (makeError && platform !== "instagram") {
      ok = null;
      problem = `Could not read the Make queue (${makeError})`;
    } else if (total < (expected ?? 1)) {
      ok = false;
      problem = `${total} queued for the week, ${expected != null ? `${expected} expected` : "at least 1 expected"}`;
    }
    rows.push({ platform, expected, makeQueued: make, bufferQueued: buf, unverifiable, ok, problem });
  }

  return {
    weekStart,
    report: run ? { reportedAt: run.reportedAt.toISOString(), status: run.status, note: run.note, errors: (run.errors as string[] | null) ?? [] } : null,
    reportMissing,
    rows,
    makeError,
    failedInMake,
  };
}
