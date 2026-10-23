import type { PrismaClient } from "@/lib/prisma";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social";

// "Did next week's posts get made and queued?" — compares what the weekly Claude task reported with what is really
// queued in Buffer, and with the recent runs of the Make scenarios that publish directly (Facebook, LinkedIn, X).

type Via = "buffer" | "make" | "both";
const DEFAULT_VIA: Partial<Record<SocialPlatform, Via>> = { facebook: "make", linkedin: "make", x: "both", instagram: "buffer", tiktok: "buffer" };
export const MAKE_CHECK_PLATFORMS = ["facebook", "linkedin", "x"] as const;

export interface WeeklyRow {
  platform: SocialPlatform;
  via: Via | null;
  expected: number | null; // from the report
  bufferQueued: number | null;
  make: { keyword: string; lastRunAt: string | null; lastStatus: string | null; errors7d: number } | null;
  ok: boolean | null; // null = cannot tell
  problem: string | null;
}

export interface WeeklyCheck {
  weekStart: string;
  report: { reportedAt: string; status: string; note: string | null; errors: string[] } | null;
  reportMissing: boolean;
  rows: WeeklyRow[];
  keywords: Record<string, string>;
}

const DAY = 86_400_000;

function montreal(now: Date): { weekday: number; hour: number; ymd: string } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montreal", weekday: "short", hour: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), hour: Number(get("hour")) % 24, ymd: `${get("year")}-${get("month")}-${get("day")}` };
}

export async function getWeeklyCheck(db: PrismaClient): Promise<WeeklyCheck> {
  const now = new Date();
  const m = montreal(now);
  const today = new Date(`${m.ymd}T00:00:00Z`);
  // The Monday the next batch of posts starts: today when it is Monday, otherwise the coming Monday.
  const toMonday = (8 - m.weekday) % 7;
  const monday = new Date(today.getTime() + toMonday * DAY);
  const weekStart = monday.toISOString().slice(0, 10);

  const run = await db.socialWeeklyRun.findFirst({ where: { weekStart: monday }, orderBy: { reportedAt: "desc" } });
  const reportMissing = !run && m.weekday >= 4 && !(m.weekday === 4 && m.hour < 12) ? true : !run && m.weekday === 0;
  const reported = ((run?.posts as { platform: SocialPlatform; count: number; via: Via | null }[] | null) ?? []);

  const setting = await db.integrationSetting.findUnique({ where: { provider: "social_make_checks" } });
  const keywords = ((setting?.metadata as Record<string, string> | null) ?? {}) as Record<string, string>;

  const queued = await db.socialPost.groupBy({ by: ["platform"], where: { status: "QUEUED", postedAt: { gte: monday, lt: new Date(monday.getTime() + 7 * DAY) } }, _count: { _all: true } });
  const queuedBy = new Map(queued.map((q) => [q.platform, q._count._all]));
  const runs = await db.automationRun.findMany({ where: { source: "make", occurredAt: { gte: new Date(now.getTime() - 8 * DAY) } }, orderBy: { occurredAt: "desc" }, take: 500 });

  const rows: WeeklyRow[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const items = reported.filter((r) => r.platform === platform);
    const via = (items.find((r) => r.via)?.via as Via | undefined) ?? DEFAULT_VIA[platform] ?? null;
    if (!via && items.length === 0) continue;
    const expected = items.length ? items.reduce((s, r) => s + (r.count || 0), 0) : null;
    const usesBuffer = via === "buffer" || via === "both";
    const usesMake = via === "make" || via === "both";
    const bufferQueued = usesBuffer ? (queuedBy.get(platform) ?? 0) : null;

    let make: WeeklyRow["make"] = null;
    if (usesMake) {
      const keyword = (keywords[platform] ?? "").trim().toLowerCase();
      const mine = keyword ? runs.filter((r) => (r.name ?? "").toLowerCase().includes(keyword)) : [];
      make = {
        keyword,
        lastRunAt: mine[0]?.occurredAt.toISOString() ?? null,
        lastStatus: mine[0]?.status ?? null,
        errors7d: mine.filter((r) => r.status === "error" && now.getTime() - r.occurredAt.getTime() < 7 * DAY).length,
      };
    }

    let ok: boolean | null = true;
    let problem: string | null = null;
    if (usesBuffer && bufferQueued !== null) {
      const need = expected ?? 1;
      if (bufferQueued < need) {
        ok = false;
        problem = `Buffer has ${bufferQueued} queued for the week, ${expected != null ? `${expected} expected` : "at least 1 expected"}`;
      }
    }
    if (usesMake && make) {
      if (!make.keyword) {
        if (ok) ok = null;
        problem = problem ?? "Choose which Make scenario publishes this platform";
      } else if (!make.lastRunAt) {
        ok = false;
        problem = problem ?? "No run of the Make scenario in the last 8 days";
      } else if (make.lastStatus === "error" || make.errors7d > 0) {
        ok = false;
        problem = problem ?? `The Make scenario had ${make.errors7d || 1} error(s) in the last 7 days`;
      }
    }
    rows.push({ platform, via, expected, bufferQueued, make, ok, problem });
  }

  return {
    weekStart,
    report: run ? { reportedAt: run.reportedAt.toISOString(), status: run.status, note: run.note, errors: ((run.errors as string[] | null) ?? []) } : null,
    reportMissing,
    rows,
    keywords,
  };
}
