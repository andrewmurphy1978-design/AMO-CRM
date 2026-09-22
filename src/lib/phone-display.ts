// react-phone-number-input's main entry also bundles the <PhoneInput/>
// component itself, which isn't safe to pull into a Server Component
// module (it broke the build — "Super expression must either be null or a
// function" while collecting page data for a route that only wanted
// parsePhoneNumber). libphonenumber-js/min is the same parser with none of
// that, used directly here for parsing only.
import { parsePhoneNumber, type CountryCode, type PhoneNumber } from "libphonenumber-js/min";

// Contacts synced from systeme.io store phone numbers as plain digit strings
// that already include the country's calling code but no leading "+" — e.g.
// "18193237604" (Canada, calling code 1) or would be "33612345678" for
// France, "442071838750" for the UK, etc. libphonenumber-js can't tell those
// apart from a plain national number unless told there's a calling code
// there, so this reads it off the number itself: prepend "+" and see if the
// result is a validly-structured number for whatever calling code that
// implies. Only a handful of countries share single-digit calling codes
// (just "1", NANP), and every real calling code is at least 2 digits, so
// this is only attempted once there are enough digits (11+) that a stray
// national-only number (typically 10 digits or fewer) can't be mistaken for
// one with a calling code prefix.
// Recognizes "x1234", "ext 1234", "ext. 1234", "extension 1234", "#1234"
// (any casing, with or without a preceding space) at the end of a stored
// phone value, so an extension can travel inside the same single text field
// instead of needing its own column. Digits-only on purpose — a stray "x"
// inside a formatted number (there isn't one) would never match this
// anchored-at-the-end pattern.
const EXTENSION_PATTERN = /\s*(?:x|ext\.?|extension|#)\s*(\d+)\s*$/i;

export function splitPhoneExtension(value: string): { number: string; ext: string | null } {
  const match = value.match(EXTENSION_PATTERN);
  if (!match) return { number: value.trim(), ext: null };
  return { number: value.slice(0, match.index).trim(), ext: match[1] };
}

function parseByLeadingCallingCode(value: string): PhoneNumber | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 11) return null;
  try {
    const parsed = parsePhoneNumber(`+${digits}`);
    return parsed && parsed.isValid() ? parsed : null;
  } catch {
    return null;
  }
}

// libphonenumber's own formatInternational() renders NANP numbers as
// "+1 514-950-6985" (space + hyphens) — not the "+1 (514) 953-6985" style
// (parens around the area code) that's the common North American
// convention and what was asked for. Its formatNational() output for NANP
// numbers IS exactly that "(514) 953-6985" shape, so for calling code "1"
// this just prefixes that instead of using the international formatter.
// Every other country keeps formatInternational(), whose "+CC XX XXX
// XXXX"-style grouping already matches how European numbers are commonly
// written.
function formatForDisplay(parsed: PhoneNumber): string {
  return parsed.countryCallingCode === "1" ? `+1 ${parsed.formatNational()}` : parsed.formatInternational();
}

// Splits a stored phone value into its country (for the flag) and an
// internationally formatted number, the same way the flag-based PhoneField
// collects it. Falls back to the raw stored value untouched when it isn't
// parseable at all.
//
// Tries the number's own leading calling-code digits first (see
// `parseByLeadingCallingCode`); `defaultCountry` (an ISO alpha-2 code, e.g.
// "CA") is only a fallback for numbers with no calling code of their own —
// e.g. a free-text national number like "(514) 950-6985" with no leading 1.
export function parsePhoneForDisplay(
  value?: string | null,
  defaultCountry?: string | null
): { country: string | null; formatted: string } | null {
  if (!value) return null;

  const { number, ext } = splitPhoneExtension(value);
  const suffix = ext ? ` x ${ext}` : "";

  const byCallingCode = parseByLeadingCallingCode(number);
  if (byCallingCode) {
    return { country: byCallingCode.country ?? null, formatted: formatForDisplay(byCallingCode) + suffix };
  }

  try {
    const parsed = parsePhoneNumber(number, (defaultCountry as CountryCode) || undefined);
    if (!parsed) return { country: defaultCountry ?? null, formatted: number + suffix };
    return { country: parsed.country ?? defaultCountry ?? null, formatted: formatForDisplay(parsed) + suffix };
  } catch {
    return { country: defaultCountry ?? null, formatted: number + suffix };
  }
}

// Normalizes a stored phone value to E.164 (e.g. "+15149506985") so it can be
// handed to react-phone-number-input's controlled `value` prop, which only
// renders formatted when the value is already E.164. Returns the input
// unchanged if it can't be parsed.
export function toE164(value?: string | null, defaultCountry?: string | null): string | null {
  if (!value) return null;
  const { number } = splitPhoneExtension(value);

  const byCallingCode = parseByLeadingCallingCode(number);
  if (byCallingCode) return byCallingCode.number;

  try {
    const parsed = parsePhoneNumber(number, (defaultCountry as CountryCode) || undefined);
    return parsed ? parsed.number : number;
  } catch {
    return number;
  }
}
