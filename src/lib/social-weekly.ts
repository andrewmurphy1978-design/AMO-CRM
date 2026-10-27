import type { PrismaClient } from "@/lib/prisma";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social";
import { makeClientWith } from "@/lib/automations";
import { readTiktokSheets } from "@/lib/tiktok-sheets";
import { getProfileIds, profileId } from "@/lib/social-profiles";

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

export interface LangStats {
  expected: number | null; // from the report, when it names a language
  makeQueued: number | null; // waiting in the Make queue (null = not read)
  bufferQueued: number;
  bufferSent: number;
  sheetRecent: number | null; // rows in the Google Sheets (TikTok videos, English Instagram carousels / stories)
  sheetPending: number | null;
}

export interface WeeklyRow {
  langs: Record<"EN" | "FR", LangStats>;
  profileIds: Record<"EN" | "FR", string | null>;
  platform: SocialPlatform;
  expected: number | null; // from the report
  makeQueued: number | null; // waiting in the Make queue for the week (null = not read)
  bufferQueued: number;
  bufferSent: number; // already sent through Buffer during the week
  unverifiable: boolean;
  sheet: { recent: number; pending: number; kind: "tiktok" | "instagram" } | null; // rows in the Google Sheets Make writes to
  ok: boolean | null;
  problem: string | null;
}

export interface WeeklyCheck {
  weekStart: string;
  kind: "current" | "next" | "last";
  current: boolean; // true for a week that has started (this week, last week); false for next week
  hasData: boolean; // false for a week with no report and nothing queued anywhere (only next week can be empty)
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

/**
 * The weeks the summary covers: always the week in progress and next week (the Thursday task prepares the following
 * Monday-Sunday; before that, next week simply has no data yet). Everything the cards need (Make queue, Google Sheets, Buffer
 * posts, Claude's reports) is read once, in parallel, and shared by both cards.
 */
export async function getWeeklyChecks(db: PrismaClient, userId?: string): Promise<WeeklyCheck[]> {
  const m = montreal(new Date());
  const today = new Date(`${m.ymd}T00:00:00Z`);
  const thisMonday = new Date(today.getTime() - ((m.weekday + 6) % 7) * DAY);
  const nextMonday = new Date(thisMonday.getTime() + 7 * DAY);
  const lastMonday = new Date(thisMonday.getTime() - 7 * DAY);
  const windowEnd = new Date(nextMonday.getTime() + 7 * DAY);

  const [make, sheets, posts, runs, ids] = await Promise.all([
    (async () => {
      try {
        const client = await makeClientWith(db);
        if (!client) throw new Error("Make is not connected in Settings");
        const [queue, failed] = await Promise.all([client.listDataStoreRecords(MAKE_QUEUE_STORE_ID), client.listDataStoreRecords(MAKE_FAILED_STORE_ID)]);
        return { queue, failed: failed.length, error: null as string | null };
      } catch (e) {
        return { queue: [], failed: null as number | null, error: e instanceof Error ? e.message : String(e) };
      }
    })(),
    userId ? readTiktokSheets(db, userId) : Promise.resolve(null),
    db.socialPost.findMany({ where: { postedAt: { gte: lastMonday, lt: windowEnd }, status: { in: ["QUEUED", "SENT"] } }, select: { platform: true, language: true, status: true, postedAt: true } }),
    db.socialWeeklyRun.findMany({ where: { weekStart: { in: [lastMonday, thisMonday, nextMonday] } }, orderBy: { reportedAt: "desc" } }),
    getProfileIds(db),
  ]);

  const build = (monday: Date, kind: "current" | "next" | "last") => buildCheck({ monday, kind, m, make, sheets, posts, runs, ids });
  // Always two weeks: this week, then next week — or last week while next week has no data yet.
  const next = build(nextMonday, "next");
  return [build(thisMonday, "current"), next.hasData ? next : build(lastMonday, "last")];
}

type Shared = {
  monday: Date;
  kind: "current" | "next" | "last";
  ids: Record<string, string>;
  m: ReturnType<typeof montreal>;
  make: { queue: { key: string; data: Record<string, unknown> }[]; failed: number | null; error: string | null };
  sheets: Awaited<ReturnType<typeof readTiktokSheets>> | null;
  posts: { platform: string; language: string; status: string; postedAt: Date | null }[];
  runs: { weekStart: Date; reportedAt: Date; status: string; note: string | null; errors: unknown; posts: unknown }[];
};

function buildCheck({ monday, kind, ids, m, make, sheets, posts, runs }: Shared): WeeklyCheck {
  const current = kind !== "next";
  const weekEnd = new Date(monday.getTime() + 7 * DAY);
  const weekStart = monday.toISOString().slice(0, 10);
  const run = runs.find((r) => r.weekStart.getTime() === monday.getTime());
  const afterThursdayNoon = m.weekday >= 5 || m.weekday === 0 || (m.weekday === 4 && m.hour >= 12);
  const reportMissing = !run && (kind === "current" || (kind === "next" && afterThursdayNoon));
  const reported = (run?.posts as { platform: SocialPlatform; language?: string | null; count: number }[] | null) ?? [];
  const makeError = make.error;

  const makeQueued = new Map<SocialPlatform, number>();
  const makeQueuedLang = new Map<string, number>(); // "platform:EN"
  for (const r of make.queue) {
    const base = BASE[String(r.data.platform ?? "").toLowerCase()];
    const when = r.data.scheduled_time ? new Date(String(r.data.scheduled_time)) : null;
    if (!base || !when || Number.isNaN(when.getTime()) || when < monday || when >= weekEnd) continue;
    makeQueued.set(base, (makeQueued.get(base) ?? 0) + 1);
    const lg = String(r.data.language ?? "").toUpperCase() === "FR" ? "FR" : "EN";
    makeQueuedLang.set(`${base}:${lg}`, (makeQueuedLang.get(`${base}:${lg}`) ?? 0) + 1);
  }

  const inWeek = posts.filter((p) => p.postedAt && p.postedAt >= monday && p.postedAt < weekEnd);
  const count = (status: string, platform: string, language?: string) =>
    inWeek.filter((p) => p.status === status && p.platform === platform && (!language || p.language.toUpperCase() === language)).length;

  const rows: WeeklyRow[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const exp = reported.filter((r) => r.platform === platform);
    const expected = exp.length ? exp.reduce((s, r) => s + (r.count || 0), 0) : null;
    const unverifiable = platform === "tiktok";
    const queued = makeError ? null : (makeQueued.get(platform) ?? 0);
    const buf = count("QUEUED", platform);
    const sentNow = count("SENT", platform);
    // English Instagram carousels and stories go through the EN Google Sheet as text-only rows, like TikTok rows go
    // through the sheets with a video; the sheets carry no platform column, so a video marks TikTok and a text-only
    // row marks Instagram.
    const sheetOk = sheets?.ok ? sheets.counts : null;
    const sheetRow: WeeklyRow["sheet"] = !sheetOk
      ? null
      : platform === "tiktok"
        ? { kind: "tiktok", recent: sheetOk.FR.recentVideo + sheetOk.EN.recentVideo, pending: sheetOk.FR.pendingVideo + sheetOk.EN.pendingVideo }
        : platform === "instagram"
          ? { kind: "instagram", recent: sheetOk.EN.recentText, pending: sheetOk.EN.pendingText }
          : null;
    const langs = {} as Record<"EN" | "FR", LangStats>;
    for (const lg of ["EN", "FR"] as const) {
      const named = exp.filter((r) => r.language);
      const sheetLang =
        !sheetOk
          ? null
          : platform === "tiktok"
            ? { recent: sheetOk[lg].recentVideo, pending: sheetOk[lg].pendingVideo }
            : platform === "instagram" && lg === "EN"
              ? { recent: sheetOk.EN.recentText, pending: sheetOk.EN.pendingText }
              : null;
      langs[lg] = {
        expected: named.length ? named.filter((r) => String(r.language).toUpperCase() === lg).reduce((a, r) => a + (r.count || 0), 0) : null,
        makeQueued: makeError ? null : (makeQueuedLang.get(`${platform}:${lg}`) ?? 0),
        bufferQueued: count("QUEUED", platform, lg),
        bufferSent: count("SENT", platform, lg),
        sheetRecent: sheetLang?.recent ?? null,
        sheetPending: sheetLang?.pending ?? null,
      };
    }
    // Posts Make publishes itself (Facebook, LinkedIn, French Instagram) leave no trace once published, so during the
    // week in progress only what is still waiting, plus what Buffer sent, can be counted.
    const total = (queued ?? 0) + buf + (current ? sentNow : 0) + (!current && platform === "instagram" ? (sheetRow?.recent ?? 0) : 0);
    let ok: boolean | null = true;
    let problem: string | null = null;
    if (platform === "youtube" && expected == null) {
      ok = null; // nothing scheduled for YouTube
    } else if (unverifiable) {
      // TikTok posts go to Google Sheets and leave the Make queue at once, so the sheets (or, failing that, the
      // Thursday report) are the only evidence.
      if (sheetRow) {
        if (!current && sheetRow.recent < (expected ?? 1)) {
          ok = false;
          problem = `${sheetRow.recent} added to the TikTok sheets in the last 7 days, ${expected != null ? `${expected} expected` : "at least 1 expected"}`;
        }
      } else if (expected) {
        problem = `${expected} sent to the TikTok sheets according to Claude's report (not verified: ${sheets && !sheets.ok ? sheets.error : "no Google account"})`;
      } else {
        ok = null;
        problem = sheets && !sheets.ok ? sheets.error : "TikTok posts are written to Google Sheets; only the Thursday report can confirm them";
      }
    } else if (makeError && platform !== "instagram") {
      ok = null;
      problem = `Could not read the Make queue (${makeError})`;
    } else if (!current && total < (expected ?? 1)) {
      ok = false;
      problem = `${total} queued for the week, ${expected != null ? `${expected} expected` : "at least 1 expected"}`;
    }
    rows.push({ profileIds: { EN: profileId(ids, platform, "EN"), FR: profileId(ids, platform, "FR") }, langs, platform, expected, makeQueued: queued, bufferQueued: buf, bufferSent: sentNow, unverifiable, sheet: sheetRow, ok, problem });
  }

  const hasData = kind !== "next" || !!run || rows.some((r) => (r.makeQueued ?? 0) > 0 || r.bufferQueued > 0);
  return {
    weekStart,
    kind,
    current,
    hasData,
    report: run ? { reportedAt: run.reportedAt.toISOString(), status: run.status, note: run.note, errors: (run.errors as string[] | null) ?? [] } : null,
    reportMissing,
    rows,
    makeError,
    failedInMake: make.failed,
  };
}
