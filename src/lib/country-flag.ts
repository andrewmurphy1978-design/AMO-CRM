import { COUNTRIES } from "./countries";

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.name.toLowerCase(), c.code])
);

// Contact records store country as free text from systeme.io (e.g. "Canada")
// as well as plain 2-letter codes from the CRM's own forms — this resolves
// either to an ISO alpha-2 code, or null if it can't be matched.
export function countryToCode(countryNameOrCode?: string | null): string | null {
  if (!countryNameOrCode) return null;
  const raw = countryNameOrCode.trim();
  if (raw.length === 2) return raw.toUpperCase();
  return NAME_TO_CODE[raw.toLowerCase()] ?? null;
}

// Regional indicator symbol flag emoji — no icon assets/fonts needed.
export function countryFlag(countryNameOrCode?: string | null): string {
  const code = countryToCode(countryNameOrCode);
  if (!code) return "";
  return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
}
