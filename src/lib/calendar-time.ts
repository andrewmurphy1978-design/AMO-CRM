// date-fns' locale-default time formatting ignores the user's own 12h/24h
// preference (it's tied to the UI language instead — French defaults to
// 24h, English to 12h), so every calendar view formats times with
// Intl.DateTimeFormat directly and an explicit hour12, the same approach
// as World Clocks and the Date/Time card. Shared by the Dashboard's
// calendar card and the full multi-view Calendar page.
export function formatClockTime(date: Date, hour12: boolean, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, { hour: "numeric", minute: "2-digit", hour12 }).format(date);
}

// Whole-hour gutter labels for a day-grid view: "09:00"/"17:00" on 24h,
// "9AM"/"5PM" (no space, correctly wrapping past noon) on 12h.
export function formatHourMark(hour: number, hour12: boolean, intlLocale: string): string {
  const date = new Date(2000, 0, 1, hour, 0);
  if (!hour12) {
    return new Intl.DateTimeFormat(intlLocale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
  const parts = new Intl.DateTimeFormat(intlLocale, { hour: "numeric", hour12: true }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? String(hour);
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  return `${hourPart}${dayPeriod}`;
}
