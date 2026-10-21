import { fiscalYearRange } from "./reports";

// Date ranges for comparing periods: the overview's year / month to date, and the reports' charts.

export interface Range {
  from: Date;
  to: Date;
  label: string;
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function today(): Date {
  const n = new Date();
  return utc(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/** The fiscal year containing `d`, from its first day. */
export function fiscalYearStart(endMonth: number, d: Date): Date {
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1 > endMonth ? 1 : 0);
  return fiscalYearRange(endMonth, y).from;
}

/** Year to date, the previous calendar month, and month to date. */
export function overviewRanges(endMonth: number, now = today()): { ytd: Range; prev: Range; mtd: Range } {
  const monthStart = utc(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const prevStart = utc(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const prevEnd = utc(now.getUTCFullYear(), now.getUTCMonth(), 0);
  return {
    ytd: { from: fiscalYearStart(endMonth, now), to: now, label: "YTD" },
    prev: { from: prevStart, to: prevEnd, label: iso(prevStart).slice(0, 7) },
    mtd: { from: monthStart, to: now, label: iso(monthStart).slice(0, 7) },
  };
}

export type By = "week" | "month" | "quarter" | "year";

/** The last `count` periods of the given kind, ending with the one that contains `now` (the last one runs to date). */
export function seriesRanges(by: By, count: number, endMonth: number, now = today()): Range[] {
  const out: Range[] = [];
  for (let i = count - 1; i >= 0; i--) {
    if (by === "week") {
      const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
      const from = utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow - 7 * i);
      const to = utc(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 6);
      out.push({ from, to: to > now ? now : to, label: iso(from).slice(5) });
    } else if (by === "month") {
      const from = utc(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      const to = utc(from.getUTCFullYear(), from.getUTCMonth() + 1, 0);
      out.push({ from, to: to > now ? now : to, label: iso(from).slice(0, 7) });
    } else if (by === "quarter") {
      const q = Math.floor(now.getUTCMonth() / 3) - i;
      const from = utc(now.getUTCFullYear(), q * 3, 1);
      const to = utc(from.getUTCFullYear(), from.getUTCMonth() + 3, 0);
      out.push({ from, to: to > now ? now : to, label: `${from.getUTCFullYear()} Q${Math.floor(from.getUTCMonth() / 3) + 1}` });
    } else {
      const endYear = now.getUTCFullYear() + (now.getUTCMonth() + 1 > endMonth ? 1 : 0) - i;
      const fy = fiscalYearRange(endMonth, endYear);
      out.push({ from: fy.from, to: fy.to > now ? now : fy.to, label: String(endYear) });
    }
  }
  return out;
}

/** The same range one year earlier (for a year-over-year comparison). */
export function yearBefore(r: Range): Range {
  const shift = (d: Date) => utc(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate());
  return { from: shift(r.from), to: shift(r.to), label: r.label };
}
