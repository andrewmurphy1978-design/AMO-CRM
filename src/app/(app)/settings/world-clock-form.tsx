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
  initialHeaderZoneMobile,
}: {
  lang: Lang;
  initialZones: string[];
  initialHeaderZones: string[];
  initialHeaderZoneMobile: string | null;
}) {
  const t = getDict(lang);
  const [state, formAction, pending] = useActionState(saveWorldClockSettings, undefined);
  const [zones, setZones] = useState(initialZones);
  const [headerZones, setHeaderZones] = useState(initialHeaderZones);
  const [headerZoneMobile, setHeaderZoneMobile] = useState(initialHeaderZoneMobile ?? "");
  // Pure/deterministic (Intl.supportedValuesOf + a fixed reference date —
  // see src/lib/timezones.ts), so computing it at render time is fine.
  const options = getWorldTimeZoneOptions();

  function handleZonesChange(next: string[]) {
    if (next.length > MAX_WORLD_CLOCK_ZONES) return;
    setZones(next);
    setHeaderZones((h) => h.filter((z) => next.includes(z)));
    setHeaderZoneMobile((m) => (next.includes(m) ? m : ""));
  }

  // `zones`' own array order is what the World Clock header widget's
  // dropdown displays in (see effectiveWorldClockZones) — moving an entry
  // here is the only way a user can control that order, since the
  // MultiSelect above always appends newly-checked zones to the end.
  function moveZone(index: number, direction: -1 | 1) {
    setZones((z) => {
      const target = index + direction;
      if (target < 0 || target >= z.length) return z;
      const next = [...z];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleHeaderZone(zone: string) {
    setHeaderZones((h) => {
      if (h.includes(zone)) {
        setHeaderZoneMobile((m) => (m === zone ? "" : m));
        return h.filter((z) => z !== zone);
      }
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
      <input type="hidden" name="headerZoneMobile" value={headerZoneMobile} />

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
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">
            {t.settings.worldClockOrderLabel}
          </p>
          <p className="mt-1 text-xs text-soft">{t.settings.worldClockOrderDesc}</p>
          <ul className="mt-2 divide-y divide-card-border rounded-md border border-card-border">
            {zones.map((zone, i) => (
              <li key={zone} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="min-w-0 truncate text-sm text-ink">
                  <span className="mr-2 text-xs text-soft">{i + 1}.</span>
                  {zoneShortLabel(zone)}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveZone(i, -1)}
                    disabled={i === 0}
                    aria-label={t.settings.worldClockMoveUp}
                    className="rounded border border-card-border px-1.5 py-0.5 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveZone(i, 1)}
                    disabled={i === zones.length - 1}
                    aria-label={t.settings.worldClockMoveDown}
                    className="rounded border border-card-border px-1.5 py-0.5 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {headerZones.length > 0 && (
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
            {t.settings.worldClockHeaderMobileLabel}
          </label>
          <p className="mt-1 text-xs text-soft">{t.settings.worldClockHeaderMobileDesc}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {headerZones.map((zone) => {
              const checked = headerZoneMobile === zone;
              return (
                <label
                  key={zone}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                    checked ? "border-amo-gold bg-amo-gold/10 text-ink" : "border-card-border text-soft"
                  }`}
                >
                  <input
                    type="radio"
                    name="headerZoneMobileRadio"
                    checked={checked}
                    onChange={() => setHeaderZoneMobile(zone)}
                    className="h-3.5 w-3.5"
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
