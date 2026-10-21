import { fiscalYearRange } from "./reports";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The period a report covers: a date interval, a single month, or the fiscal year (the default). */
export function resolveRange(sp: { from?: string; to?: string; month?: string; year?: string }, endMonth: number) {
  const year = Number(sp.year) || new Date().getUTCFullYear();
  const interval = DATE_RE.test(sp.from ?? "") && DATE_RE.test(sp.to ?? "") && (sp.from as string) <= (sp.to as string);
  const monthly = !interval && MONTH_RE.test(sp.month ?? "");
  const range = interval
    ? { from: new Date(`${sp.from}T00:00:00.000Z`), to: new Date(`${sp.to}T00:00:00.000Z`) }
    : monthly
      ? (() => {
          const [y, mo] = (sp.month as string).split("-").map(Number);
          return { from: new Date(Date.UTC(y, mo - 1, 1)), to: new Date(Date.UTC(y, mo, 0)) };
        })()
      : fiscalYearRange(endMonth, year);
  // The balance sheet's current-year earnings run from the start of the fiscal year the period ends in.
  const endY = range.to.getUTCFullYear() + (range.to.getUTCMonth() + 1 > endMonth ? 1 : 0);
  const fyStart = fiscalYearRange(endMonth, endY).from;
  const periodMode: "interval" | "month" | "year" = interval ? "interval" : monthly ? "month" : "year";
  return { range, fyStart, periodMode, year };
}
