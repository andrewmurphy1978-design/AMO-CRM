"use client";

import { useActionState, useState } from "react";
import { saveWorldClockSettings } from "@/actions/users";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getWorldTimeZoneOptions, zoneShortLabel } from "@/lib/timezones";
import { MAX_WORLD_CLOCK_ZONES, HEADER_CLOCK_COUNT } from "@/lib/world-clock-zones";
import MultiSelect from "@/components/multi-select";

export default function WorldClockForm({
  lang,
  initialZones,
  initialHeaderZones,
}: {
  lang: Lang;
  initialZones: string[];
  initialHeaderZones: string[];
}) {
  const t = getDict(lang);
  const [state, formAction, pending] = useActionState(saveWorldClockSettings, undefined);
  const [zones, setZones] = useState(initialZones);
  const [headerZones, setHeaderZones] = useState(initialHeaderZones);
  // Pure/deterministic (Intl.supportedValuesOf + a fixed reference date —
  // see src/lib/timezones.ts), so computing it at render time is fine.
  const options = getWorldTimeZoneOptions();

  function handleZonesChange(next: string[]) {
    if (next.length > MAX_WORLD_CLOCK_ZONES) return;
    setZones(next);
    setHeaderZones((h) => h.filter((z) => next.includes(z)));
  }

  function toggleHeaderZone(zone: string) {
    setHeaderZones((h) => {
      if (h.includes(zone)) return h.filter((z) => z !== zone);
      if (h.length >= HEADER_CLOCK_COUNT) return h;
      return [...h, zone];
    });
  }

  return (
    <form action={formAction} className="mt-6 border-t border-card-border pt-5">
      {zones.map((z) => (
        <input key={z} type="hidden" name="zones" value={z} />
      ))}
      {headerZones.map((z) => (
        <input key={z} type="hidden" name="headerZones" value={z} />
      ))}

      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
        {t.settings.worldClockZonesLabel}
      </label>
      <p className="mt-1 text-xs text-soft">{t.settings.worldClockZonesDesc}</p>
      <div className="mt-2">
        <MultiSelect
          options={options}
          selected={zones}
          placeholder={t.settings.worldClockZonesPlaceholder}
          onChange={handleZonesChange}
        />
      </div>

      {zones.length > 0 && (
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
            {t.settings.worldClockHeaderLabel}
          </label>
          <p className="mt-1 text-xs text-soft">{t.settings.worldClockHeaderDesc}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {zones.map((zone) => {
              const checked = headerZones.includes(zone);
              return (
                <label
                  key={zone}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                    checked ? "border-amo-gold bg-amo-gold/10 text-ink" : "border-card-border text-soft"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleHeaderZone(zone)}
                    disabled={!checked && headerZones.length >= HEADER_CLOCK_COUNT}
                    className="h-3.5 w-3.5 rounded border-card-border"
                  />
                  {zoneShortLabel(zone)}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary mt-4 rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.settings.worldClockSaving : t.settings.worldClockSave}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="mt-2 text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}
