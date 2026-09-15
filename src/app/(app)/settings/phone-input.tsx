"use client";

import { useState } from "react";
import { AsYouType, getCountryCallingCode } from "libphonenumber-js/min";

// Formats as the user types, using that country's own conventions (e.g.
// +1 (514) 953-6985 for Canada/US, +33 6 22.11.33.55 for France) via
// libphonenumber-js — reformats immediately if the country changes.
export default function PhoneInput({
  name,
  label,
  country,
  defaultValue,
  className,
}: {
  name: string;
  label: string;
  country: string;
  defaultValue?: string | null;
  className?: string;
}) {
  const [value, setValue] = useState(() => formatValue(defaultValue ?? "", country));
  const [lastCountry, setLastCountry] = useState(country);

  if (country !== lastCountry) {
    setLastCountry(country);
    setValue((current) => formatValue(current, country));
  }

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{label}</label>
      <input
        name={name}
        type="tel"
        value={value}
        onChange={(e) => setValue(formatValue(e.target.value, country))}
        placeholder={country === "FR" ? "+33 6 22.11.33.55" : "+1 (514) 953-6985"}
        className={
          className ??
          "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        }
      />
    </div>
  );
}

// Builds "+<country code> <nationally-formatted number>" ourselves (e.g.
// +1 (514) 953-6985, +33 6 22.11.33.55) rather than feeding a leading "+"
// straight into AsYouType, which drops the parens/dashes style in favor of
// plain international spacing — not what was asked for.
function formatValue(raw: string, country: string): string {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  let callingCode: string;
  try {
    callingCode = getCountryCallingCode(country as never);
  } catch {
    return raw;
  }

  // Drop a self-typed country code so it isn't duplicated when we prepend it.
  if (digits.startsWith(callingCode) && digits.length > callingCode.length) {
    digits = digits.slice(callingCode.length);
  }

  try {
    let national = new AsYouType(country as never).input(digits);
    // Many countries (FR, GB, DE, ...) use a leading trunk "0" nationally
    // that's dropped internationally — without it, AsYouType can't group
    // the digits at all and just echoes them back unformatted. NANP
    // (CA/US) has no such trunk digit, so the first attempt above already
    // succeeds there and this never fires.
    if (national === digits && !digits.startsWith("0")) {
      const withTrunk = new AsYouType(country as never).input(`0${digits}`);
      if (withTrunk !== `0${digits}`) national = withTrunk.replace(/^0\s*/, "");
    }

    if (country === "FR") {
      const parts = national.split(" ").filter(Boolean);
      if (parts.length > 1) national = `${parts[0]} ${parts.slice(1).join(".")}`;
    }

    return `+${callingCode} ${national}`.trim();
  } catch {
    return raw;
  }
}
