// Cloudflare Workers (and this app's own local dev) always run in UTC —
// there's no per-request "user's local timezone" the runtime knows about.
// The Dashboard's Server Component computes several "today"/"yesterday"/
// "tomorrow" buckets (new emails today, new contacts today/yesterday,
// task deadlines today/tomorrow) directly on the server, and plain
// date-fns isToday/isYesterday/isTomorrow compare calendar days in the
// *runtime's* timezone — i.e. UTC, not Andrew's own Eastern time. For
// several hours around UTC midnight (which is evening in Eastern time),
// that silently misclassified most of the actual day's mail/contacts/
// tasks as "yesterday" instead of "today", undercounting the Dashboard's
// own summary tiles. Everything client-side (the Calendar page/card,
// which run in the visitor's own browser timezone) is unaffected — this
// is only needed for computations done in a Server Component.
//
// This CRM is currently single-team, based in Ste-Agathe-des-Monts, QC,
// so a fixed IANA zone is enough; if this ever becomes multi-timezone,
// this should become a per-user setting instead.
export const APP_TIME_ZONE = "America/Toronto";

function zonedDateKey(date: Date, timeZone: string): string {
  // "en-CA" formats as YYYY-MM-DD — a directly comparable calendar-day key.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isTodayInZone(date: Date, timeZone: string = APP_TIME_ZONE): boolean {
  return zonedDateKey(date, timeZone) === zonedDateKey(new Date(), timeZone);
}

export function isYesterdayInZone(date: Date, timeZone: string = APP_TIME_ZONE): boolean {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return zonedDateKey(date, timeZone) === zonedDateKey(yesterday, timeZone);
}

export function isTomorrowInZone(date: Date, timeZone: string = APP_TIME_ZONE): boolean {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return zonedDateKey(date, timeZone) === zonedDateKey(tomorrow, timeZone);
}

// The zone's current UTC offset, in minutes east of UTC (e.g. -240 for
// Eastern Daylight Time) — read by formatting `date` in the zone and
// comparing that wall-clock reading (misread as if it were already UTC)
// against the real UTC instant.
function zonedOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // formatToParts renders midnight as "24" for the hour in some engines —
  // normalize that back to 0 before feeding Date.UTC.
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return (asUtc - date.getTime()) / 60_000;
}

// The real instant of local midnight, "today", in the given zone — used as
// a query lower bound so a task due earlier in the zone's own calendar day
// isn't excluded just because the server's own UTC day rolled over first
// (or hasn't yet). Recomputes the zone's offset at "now" rather than
// assuming a fixed one, so this still lands on the right side of a DST
// transition on the (rare) day it happens.
export function startOfTodayInZone(timeZone: string = APP_TIME_ZONE): Date {
  const now = new Date();
  const offsetMin = zonedOffsetMinutes(now, timeZone);
  const shifted = new Date(now.getTime() + offsetMin * 60_000);
  const localMidnightAsUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(localMidnightAsUtc - offsetMin * 60_000);
}
