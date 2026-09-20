import { countryToCode } from "./country-flag";
import { normalizeRegionForCountry } from "./regions";

// One representative IANA zone per province — Canada spans 6 zones, so
// country-level alone isn't enough. Saskatchewan doesn't observe DST
// (fixed CST, same as America/Regina); everywhere else does.
const CA_PROVINCE_TIMEZONE: Record<string, string> = {
  AB: "America/Edmonton",
  BC: "America/Vancouver",
  MB: "America/Winnipeg",
  NB: "America/Moncton",
  NL: "America/St_Johns",
  NS: "America/Halifax",
  NT: "America/Yellowknife",
  NU: "America/Iqaluit",
  ON: "America/Toronto",
  PE: "America/Halifax",
  QC: "America/Toronto",
  SK: "America/Regina",
  YT: "America/Whitehorse",
};

// One representative zone per state — most US states sit entirely in one
// zone; for the handful split across two (e.g. TX, TN, ND), this picks the
// zone covering the larger population.
const US_STATE_TIMEZONE: Record<string, string> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Denver",
  IL: "America/Chicago",
  IN: "America/New_York",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/New_York",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
  PR: "America/Puerto_Rico",
  GU: "Pacific/Guam",
  VI: "America/St_Thomas",
  AS: "Pacific/Pago_Pago",
  MP: "Pacific/Saipan",
};

const AU_STATE_TIMEZONE: Record<string, string> = {
  NSW: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  QLD: "Australia/Brisbane",
  WA: "Australia/Perth",
  SA: "Australia/Adelaide",
  TAS: "Australia/Hobart",
  NT: "Australia/Darwin",
  ACT: "Australia/Sydney",
};

// Single representative zone for countries with (for our purposes) one
// effective timezone.
const COUNTRY_TIMEZONE: Record<string, string> = {
  FR: "Europe/Paris",
  AT: "Europe/Vienna",
  BE: "Europe/Brussels",
  BR: "America/Sao_Paulo",
  CH: "Europe/Zurich",
  CN: "Asia/Shanghai",
  DE: "Europe/Berlin",
  DK: "Europe/Copenhagen",
  ES: "Europe/Madrid",
  FI: "Europe/Helsinki",
  GB: "Europe/London",
  GR: "Europe/Athens",
  IE: "Europe/Dublin",
  IN: "Asia/Kolkata",
  IT: "Europe/Rome",
  JP: "Asia/Tokyo",
  MA: "Africa/Casablanca",
  MX: "America/Mexico_City",
  NL: "Europe/Amsterdam",
  NO: "Europe/Oslo",
  NZ: "Pacific/Auckland",
  PL: "Europe/Warsaw",
  PT: "Europe/Lisbon",
  SE: "Europe/Stockholm",
  SG: "Asia/Singapore",
  TN: "Africa/Tunis",
  ZA: "Africa/Johannesburg",
};

// Best-effort IANA timezone for a contact's country/state — used to show
// their local time, not for anything legal/billing-sensitive, so a
// single representative zone per state/province is an acceptable
// simplification even though a few states/provinces technically split
// across two zones.
export function getTimezoneForCountryState(
  countryNameOrCode: string | null | undefined,
  stateNameOrCode: string | null | undefined
): string | null {
  const code = countryToCode(countryNameOrCode);
  if (!code) return null;

  if (code === "CA" || code === "US" || code === "AU") {
    const region = normalizeRegionForCountry(countryNameOrCode, stateNameOrCode);
    const table = code === "CA" ? CA_PROVINCE_TIMEZONE : code === "US" ? US_STATE_TIMEZONE : AU_STATE_TIMEZONE;
    if (region && table[region]) return table[region];
    // No state on file — fall back to the most populous zone rather than
    // showing nothing.
    return code === "CA" ? "America/Toronto" : code === "US" ? "America/New_York" : "Australia/Sydney";
  }

  return COUNTRY_TIMEZONE[code] ?? null;
}

// "UTC-5" / "UTC+5:30" — derived from the zone's *current* offset (so it
// already reflects DST), not a static table.
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(at);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  return tzPart.replace("GMT", "UTC");
}
