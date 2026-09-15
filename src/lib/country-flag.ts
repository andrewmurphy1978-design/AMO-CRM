import { COUNTRIES } from "./countries";

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.name.toLowerCase(), c.code])
);

const CODE_SET = new Set(COUNTRIES.map((c) => c.code));

// Common short forms/aliases that aren't the country's actual ISO code
// (systeme.io imports and free-typed data use these) or that don't match
// our own COUNTRIES list's full name spelling.
const ALIASES: Record<string, string> = {
  usa: "US",
  "u.s.a.": "US",
  "u.s.": "US",
  "united states of america": "US",
  uk: "GB",
  "u.k.": "GB",
  england: "GB",
};

// Contact records store country as free text from systeme.io (e.g. "Canada",
// "USA", "UK") as well as plain ISO codes from the CRM's own forms — this
// resolves any of those to a canonical ISO alpha-2 code, or null if it can't
// be matched to a country we know about.
export function countryToCode(countryNameOrCode?: string | null): string | null {
  if (!countryNameOrCode) return null;
  const trimmed = countryNameOrCode.trim();
  const lower = trimmed.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  if (NAME_TO_CODE[lower]) return NAME_TO_CODE[lower];
  const upper = trimmed.toUpperCase();
  if (CODE_SET.has(upper)) return upper;
  return null;
}

// Always the full country name (e.g. "United Kingdom", never "UK" or "GB"),
// falling back to whatever raw text was stored if it can't be resolved.
export function countryFullName(countryNameOrCode?: string | null): string {
  const code = countryToCode(countryNameOrCode);
  if (code) {
    const match = COUNTRIES.find((c) => c.code === code);
    if (match) return match.name;
  }
  return countryNameOrCode?.trim() ?? "";
}
