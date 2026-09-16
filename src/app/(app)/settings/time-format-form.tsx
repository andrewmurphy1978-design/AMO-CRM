"use client";

import { useActionState } from "react";
import { saveTimeFormat } from "@/actions/users";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import type { TimeFormat } from "@prisma/client";

export default function TimeFormatForm({ lang, timeFormat }: { lang: Lang; timeFormat: TimeFormat }) {
  const [state, formAction, pending] = useActionState(saveTimeFormat, undefined);
  const t = getDict(lang);

  return (
    <form action={formAction} className="mt-6 border-t border-card-border pt-5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
        {t.settings.timeFormatLabel}
      </label>
      <p className="mt-1 text-xs text-soft">{t.settings.timeFormatDesc}</p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="radio" name="timeFormat" value="HOUR24" defaultChecked={timeFormat === "HOUR24"} />
          {t.settings.timeFormat24}
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="radio" name="timeFormat" value="HOUR12" defaultChecked={timeFormat === "HOUR12"} />
          {t.settings.timeFormat12}
        </label>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60"
        >
          {pending ? t.settings.timeFormatSaving : t.settings.timeFormatSave}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="mt-2 text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}
