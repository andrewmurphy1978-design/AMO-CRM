"use client";

import { useState } from "react";
import PhoneInput, { type Value, type Country } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import "react-phone-number-input/style.css";
import { toE164 } from "@/lib/phone-display";

// A flag-first international phone field (like the one on the marketing
// site's funnel forms): the calling code is picked from the flag dropdown
// built into the field itself, not from a separate "Country" selector, so
// any country's number can be entered regardless of some other Country
// field elsewhere in the form. `defaultCountry` only seeds the flag shown
// before the user picks one. The formatted display and the calling code
// live in the same widget, but the value submitted with the form is the
// full E.164 string (e.g. "+15149536985"), carried via a hidden input.
export default function PhoneField({
  name,
  label,
  defaultCountry,
  defaultValue,
  hideLabel,
}: {
  name: string;
  label: string;
  defaultCountry: string;
  defaultValue?: string | null;
  hideLabel?: boolean;
}) {
  // Contacts synced from systeme.io often have phone numbers stored in
  // national format (e.g. "(514) 950-6985") rather than the E.164 string
  // this widget's controlled `value` prop requires to render formatted —
  // normalize once up front using the same country hint as the flag.
  const [value, setValue] = useState<Value | undefined>(
    (toE164(defaultValue, defaultCountry) as Value) || undefined
  );

  return (
    <div>
      {!hideLabel && <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{label}</label>}
      <PhoneInput
        international
        flags={flags}
        defaultCountry={defaultCountry as Country}
        value={value}
        onChange={setValue}
        className={hideLabel ? "amo-phone-input" : "amo-phone-input mt-1"}
      />
      <input type="hidden" name={name} value={value ?? ""} />
    </div>
  );
}
