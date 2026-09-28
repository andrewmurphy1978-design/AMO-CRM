"use client";

import { useActionState, useState } from "react";
import { saveHeaderWidgetsSettings } from "@/actions/users";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { HEADER_WIDGET_KEYS, type HeaderWidgetKey } from "@/lib/dashboard-header-widgets";

export default function HeaderWidgetsForm({
  lang,
  initialHidden,
}: {
  lang: Lang;
  initialHidden: string[];
}) {
  const t = getDict(lang);
  const [state, formAction, pending] = useActionState(saveHeaderWidgetsSettings, undefined);
  const [hidden, setHidden] = useState<string[]>(initialHidden);

  const widgetLabel: Record<HeaderWidgetKey, string> = {
    weather: t.settings.headerWidgetWeather,
    news: t.settings.headerWidgetNews,
    sports: t.settings.headerWidgetSports,
    markets: t.settings.headerWidgetMarkets,
    worldClock: t.settings.headerWidgetWorldClock,
    dateTime: t.settings.headerWidgetDateTime,
  };

  function toggle(key: string) {
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  return (
    <form action={formAction} className="mt-6 border-t border-card-border pt-5">
      {hidden.map((key) => (
        <input key={key} type="hidden" name="hiddenHeaderWidgets" value={key} />
      ))}

      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
        {t.settings.headerWidgetsLabel}
      </label>
      <p className="mt-1 text-xs text-soft">{t.settings.headerWidgetsDesc}</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {HEADER_WIDGET_KEYS.map((key) => {
          const shown = !hidden.includes(key);
          return (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                shown ? "border-amo-gold bg-amo-gold/10 text-ink" : "border-card-border text-soft"
              }`}
            >
              <input
                type="checkbox"
                checked={shown}
                onChange={() => toggle(key)}
                className="h-3.5 w-3.5 rounded border-card-border"
              />
              {widgetLabel[key]}
            </label>
          );
        })}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn-primary mt-4 rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.settings.headerWidgetsSaving : t.settings.headerWidgetsSave}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="mt-2 text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}
