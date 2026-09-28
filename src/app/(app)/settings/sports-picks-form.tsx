"use client";

import { useActionState, useState } from "react";
import { saveSportsSettings } from "@/actions/users";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { SPORTS_LEAGUE_OPTIONS, NHL_TEAM_OPTIONS, MLB_TEAM_OPTIONS } from "@/lib/dashboard-sports-picks";

export default function SportsPicksForm({
  lang,
  initialLeague,
  initialTeamNhl,
  initialTeamMlb,
}: {
  lang: Lang;
  initialLeague: string;
  initialTeamNhl: string;
  initialTeamMlb: string;
}) {
  const t = getDict(lang);
  const [state, formAction, pending] = useActionState(saveSportsSettings, undefined);
  const [league, setLeague] = useState(initialLeague);
  const [teamNhl, setTeamNhl] = useState(initialTeamNhl);
  const [teamMlb, setTeamMlb] = useState(initialTeamMlb);

  return (
    <form action={formAction} className="mt-6 border-t border-card-border pt-5">
      <input type="hidden" name="sportsLeague" value={league} />
      <input type="hidden" name="sportsTeamNhl" value={teamNhl} />
      <input type="hidden" name="sportsTeamMlb" value={teamMlb} />

      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
        {t.settings.sportsPicksLabel}
      </label>
      <p className="mt-1 text-xs text-soft">{t.settings.sportsPicksDesc}</p>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-soft">
          {t.settings.sportsPicksLeagueLabel}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {SPORTS_LEAGUE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                league === opt.value ? "border-amo-gold bg-amo-gold/10 text-ink" : "border-card-border text-soft"
              }`}
            >
              <input
                type="radio"
                name="sportsLeagueRadio"
                checked={league === opt.value}
                onChange={() => setLeague(opt.value)}
                className="h-3.5 w-3.5"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="sportsTeamNhlSelect" className="block text-xs font-semibold uppercase tracking-wide text-soft">
            {t.settings.sportsPicksTeamNhlLabel}
          </label>
          <select
            id="sportsTeamNhlSelect"
            value={teamNhl}
            onChange={(e) => setTeamNhl(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          >
            {NHL_TEAM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sportsTeamMlbSelect" className="block text-xs font-semibold uppercase tracking-wide text-soft">
            {t.settings.sportsPicksTeamMlbLabel}
          </label>
          <select
            id="sportsTeamMlbSelect"
            value={teamMlb}
            onChange={(e) => setTeamMlb(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          >
            {MLB_TEAM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn-primary mt-4 rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.settings.sportsPicksSaving : t.settings.sportsPicksSave}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="mt-2 text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}
