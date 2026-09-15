// react-phone-number-input's main entry also bundles the <PhoneInput/>
// component itself, which isn't safe to pull into a Server Component
// module (it broke the build — "Super expression must either be null or a
// function" while collecting page data for a route that only wanted
// parsePhoneNumber). libphonenumber-js/min is the same parser with none of
// that, used directly here for parsing only.
import { parsePhoneNumber } from "libphonenumber-js/min";
import { countryFlag } from "./country-flag";

// Renders a stored phone value the same way the flag-based PhoneField
// collects it: flag + internationally formatted number. Falls back to the
// raw stored value untouched when it isn't a parseable E.164 string (e.g.
// older free-text numbers synced in from systeme.io before this existed).
export function formatPhoneDisplay(value?: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = parsePhoneNumber(value);
    if (!parsed) return value;
    const flag = parsed.country ? countryFlag(parsed.country) : "";
    return `${flag} ${parsed.formatInternational()}`.trim();
  } catch {
    return value;
  }
}
