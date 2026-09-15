// react-phone-number-input's main entry also bundles the <PhoneInput/>
// component itself, which isn't safe to pull into a Server Component
// module (it broke the build — "Super expression must either be null or a
// function" while collecting page data for a route that only wanted
// parsePhoneNumber). libphonenumber-js/min is the same parser with none of
// that, used directly here for parsing only.
import { parsePhoneNumber } from "libphonenumber-js/min";

// Splits a stored phone value into its country (for the flag) and an
// internationally formatted number, the same way the flag-based PhoneField
// collects it. Falls back to the raw stored value untouched when it isn't a
// parseable E.164 string (e.g. older free-text numbers synced in from
// systeme.io before this existed).
export function parsePhoneForDisplay(value?: string | null): { country: string | null; formatted: string } | null {
  if (!value) return null;
  try {
    const parsed = parsePhoneNumber(value);
    if (!parsed) return { country: null, formatted: value };
    return { country: parsed.country ?? null, formatted: parsed.formatInternational() };
  } catch {
    return { country: null, formatted: value };
  }
}
