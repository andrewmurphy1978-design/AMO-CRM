"use client";

import { useActionState, useState } from "react";
import { saveSportsSettings } from "@/actions/users";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import {
  SPORTS_LEAGUE_OPTIONS,
  NHL_TEAM_OPTIONS,
  MLB_TEAM_OPTIONS,
  NFL_TEAM_OPTIONS,
  CFL_TEAM_OPTIONS,
  MLS_TEAM_OPTIONS,
  NBA_TEAM_OPTIONS,
} from "@/lib/dashboard-sports-picks";

export default function SportsPicksForm({
  lang,
  initialLeague,
  initialTeamNhl,
  initialTeamMlb,
  initialTeamNfl,
  initialTeamCfl,
  initialTeamMls,
  initialTeamNba,
  initialLeagueMobile,
}: {
  lang: Lang;
  initialLeague: string;
  initialTeamNhl: string;
  initialTeamMlb: string;
  initialTeamNfl: string;
  initialTeamCfl: string;
  initialTeamMls: string;
  initialTeamNba: string;
  initialLeagueMobile: string | null;
}) {
  const t = getDict(lang);
  const [state, formAction, pending] = useActionState(saveSportsSettings, undefined);
  const [league, setLeague] = useState(initialLeague);
  const [teamNhl, setTeamNhl] = useState(initialTeamNhl);
  const [teamMlb, setTeamMlb] = useState(initialTeamMlb);
  const [teamNfl, setTeamNfl] = useState(initialTeamNfl);
  const [teamCfl, setTeamCfl] = useState(initialTeamCfl);
  const [teamMls, setTeamMls] = useState(initialTeamMls);
  const [teamNba, setTeamNba] = useState(initialTeamNba);
  const [leagueMobile, setLeagueMobile] = useState(initialLeagueMobile ?? initialLeague);

  // One team-select block per league, driven from a small config array
  // instead of six near-identical <select> blocks — every league gets its
  // own remembered team (see dashboard-sports-picks.ts) so switching which
  // league is shown never loses another league's pick.
  const teamPickers = [
    {
      key: "Nhl",
      label: t.settings.sportsPicksTeamNhlLabel,
      options: NHL_TEAM_OPTIONS,
      value: teamNhl,
      setValue: setTeamNhl,
      fieldName: "sportsTeamNhl",
    },
    {
      key: "Mlb",
      label: t.settings.sportsPicksTeamMlbLabel,
      options: MLB_TEAM_OPTIONS,
      value: teamMlb,
      setValue: setTeamMlb,
      fieldName: "sportsTeamMlb",
    },
    {
      key: "Nfl",
      label: t.settings.sportsPicksTeamNflLabel,
      options: NFL_TEAM_OPTIONS,
      value: teamNfl,
      setValue: setTeamNfl,
      fieldName: "sportsTeamNfl",
    },
    {
      key: "Cfl",
      label: t.settings.sportsPicksTeamCflLabel,
      options: CFL_TEAM_OPTIONS,
      value: teamCfl,
      setValue: setTeamCfl,
      fieldName: "sportsTeamCfl",
    },
    {
      key: "Mls",
      label: t.settings.sportsPicksTeamMlsLabel,
      options: MLS_TEAM_OPTIONS,
      value: teamMls,
      setValue: setTeamMls,
      fieldName: "sportsTeamMls",
    },
    {
      key: "Nba",
      label: t.settings.sportsPicksTeamNbaLabel,
      options: NBA_TEAM_OPTIONS,
      value: teamNba,
      setValue: setTeamNba,
      fieldName: "sportsTeamNba",
    },
  ] as const;

  return (
    <form action={formAction} className="mt-6 border-t border-card-border pt-5">
      <input type="hidden" name="sportsLeague" value={league} />
      <input type="hidden" name="sportsLeagueMobile" value={leagueMobile} />
      {teamPickers.map((picker) => (
        <input key={picker.fieldName} type="hidden" name={picker.fieldName} value={picker.value} />
      ))}

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

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-soft">
          {t.settings.sportsPicksLeagueMobileLabel}
        </p>
        <p className="mt-1 text-xs text-soft">{t.settings.sportsPicksLeagueMobileDesc}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {SPORTS_LEAGUE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                leagueMobile === opt.value ? "border-amo-gold bg-amo-gold/10 text-ink" : "border-card-border text-soft"
              }`}
            >
              <input
                type="radio"
                name="sportsLeagueMobileRadio"
                checked={leagueMobile === opt.value}
                onChange={() => setLeagueMobile(opt.value)}
                className="h-3.5 w-3.5"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {teamPickers.map((picker) => (
          <div key={picker.key}>
            <label
              htmlFor={`sportsTeam${picker.key}Select`}
              className="block text-xs font-semibold uppercase tracking-wide text-soft"
            >
              {picker.label}
            </label>
            <select
              id={`sportsTeam${picker.key}Select`}
              value={picker.value}
              onChange={(e) => picker.setValue(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            >
              {picker.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}
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
