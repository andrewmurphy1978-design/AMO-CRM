"use client";

import { useState } from "react";
import PhoneInput, { type Value, type Country } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import "react-phone-number-input/style.css";
import { toE164, splitPhoneExtension } from "@/lib/phone-display";

// A flag-first international phone field (like the one on the marketing
// site's funnel forms): the calling code is picked from the flag dropdown
// built into the field itself, not from a separate "Country" selector, so
// any country's number can be entered regardless of some other Country
// field elsewhere in the form. `defaultCountry` only seeds the flag shown
// before the user picks one. The formatted display and the calling code
// live in the same widget, but the value submitted with the form is the
// full E.164 string (e.g. "+15149536985"), plus " x1234" appended when an
// extension was entered — carried via a single hidden input either way, so
// no caller needs its own extra form field or column just for this.
export default function PhoneField({
  name,
  label,
  defaultCountry,
  defaultValue,
  hideLabel,
  hideExtension,
  onRemove,
  removeLabel,
}: {
  name: string;
  label: string;
  defaultCountry: string;
  defaultValue?: string | null;
  hideLabel?: boolean;
  // WhatsApp numbers don't take extensions — unlike a landline/office phone
  // number, there's no PBX behind it to route through.
  hideExtension?: boolean;
  // Rendered as part of this same flex row (not wrapped around the outside
  // by the caller) so a removable row is pixel-identical to a fixed one —
  // wrapping from outside used to squeeze this field's own internal layout
  // unpredictably depending on what else shared the row with it.
  onRemove?: () => void;
  removeLabel?: string;
}) {
  // Contacts synced from systeme.io often have phone numbers stored in
  // national format (e.g. "(514) 950-6985") rather than the E.164 string
  // this widget's controlled `value` prop requires to render formatted —
  // normalize once up front using the same country hint as the flag. Any
  // trailing extension is split off before parsing and kept in its own
  // field, never fed to the phone-number widget itself.
  const [initialNumber] = useState(() => splitPhoneExtension(defaultValue ?? "").number);
  const [initialExt] = useState(() => splitPhoneExtension(defaultValue ?? "").ext ?? "");
  const [value, setValue] = useState<Value | undefined>((toE164(initialNumber, defaultCountry) as Value) || undefined);
  const [ext, setExt] = useState(initialExt);

  const combined = ext.trim() ? `${value ?? ""} x${ext.trim()}` : (value ?? "");

  return (
    <div>
      {!hideLabel && <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{label}</label>}
      <div className={`flex items-center gap-1.5 ${hideLabel ? "" : "mt-1"}`}>
        {/* Fixed width, not flex-1 — so the number field is always the same
            size across every row in a column regardless of whether that
            particular row also has an extension field and/or a remove
            button; the extension field (flex-1 below) is the one that
            shrinks to make room for those instead. */}
        <div className={hideExtension ? "min-w-0 flex-1" : "w-52 shrink-0"}>
          <PhoneInput
            international
            flags={flags}
            defaultCountry={defaultCountry as Country}
            value={value}
            onChange={setValue}
            className="amo-phone-input"
          />
        </div>
        {!hideExtension && (
          <input
            type="text"
            inputMode="numeric"
            value={ext}
            onChange={(e) => setExt(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="ext."
            aria-label="Extension"
            className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-2 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
            aria-label={removeLabel}
          >
            ✕
          </button>
        )}
      </div>
      <input type="hidden" name={name} value={hideExtension ? (value ?? "") : combined} />
    </div>
  );
}
