// A fixed reference date for computing each zone's UTC offset — DST status
// only matters for display ordering here, not for anything time-sensitive,
// so a hardcoded summer date keeps the list identical between the server
// render and the client hydration (both evaluate this at slightly
// different real times, which would otherwise risk a mismatch right at a
// DST transition).
const REFERENCE_DATE = new Date("2025-06-15T12:00:00Z");

// A short, hardcoded list to fall back to if the runtime has no
// Intl.supportedValuesOf (older engines) — covers the zones most likely to
// matter for this CRM's contacts.
const FALLBACK_ZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Halifax",
  "America/Sao_Paulo",
  "Atlantic/Azores",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Athens",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function offsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(at);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

function formatOffset(offsetMin: number): string {
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

function niceName(timeZone: string): string {
  const parts = timeZone.split("/");
  return (parts.length > 1 ? parts.slice(1) : parts).join(" – ").replace(/_/g, " ");
}

export type TimeZoneOption = { value: string; label: string };

// Every IANA zone, sorted west to east by current UTC offset — for the
// Contact form's Time Zone select. Computed at call time rather than
// stored, so it always reflects the runtime's own tz database.
export function getWorldTimeZoneOptions(): TimeZoneOption[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : FALLBACK_ZONES;
  return zones
    .map((value) => ({ value, offset: offsetMinutes(value, REFERENCE_DATE) }))
    .sort((a, b) => a.offset - b.offset || a.value.localeCompare(b.value))
    .map(({ value, offset }) => ({ value, label: `(${formatOffset(offset)}) ${niceName(value)}` }));
}
