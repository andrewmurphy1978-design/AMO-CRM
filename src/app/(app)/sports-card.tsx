"use client";

import { useState } from "react";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { Lang } from "@/lib/i18n/dictionaries";
import type {
  NhlSnapshot,
  MlbSnapshot,
  TeamSnapshot,
  SportsTeamGame,
  MlbSeriesGame,
} from "@/lib/sports";
import RefreshButton from "./refresh-button";
import clsx from "@/lib/clsx";

export interface SportsLabels {
  title: string;
  unavailable: string;
  lastGame: string;
  nextGame: string;
  final: string;
  vs: string;
  at: string;
  series: string;
  refresh: string;
  refreshing: string;
}

export type SportsCardSnapshot =
  | { league: "NHL"; nhl: NhlSnapshot }
  | { league: "MLB"; mlb: MlbSnapshot }
  | { league: "NFL"; nfl: TeamSnapshot }
  | { league: "CFL"; cfl: TeamSnapshot }
  | { league: "MLS"; mls: TeamSnapshot }
  | { league: "NBA"; nba: TeamSnapshot };

// The current team's own accent — used to make its row/score stand out in
// a postseason series list.
const TEAM_ACCENT = "text-amo-teal font-semibold";

function GameTime({
  date,
  hour12,
  dateLocale,
  at,
}: {
  date: string;
  hour12: boolean;
  dateLocale: ReturnType<typeof getDateLocale>;
  at: string;
}) {
  const d = new Date(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12,
  }).format(d);
  return (
    <span>
      {format(d, "EEE, MMM d", { locale: dateLocale })} {at} {time}
    </span>
  );
}

function TeamGameRow({
  label,
  game,
  teamName,
  teamLogo,
  hour12,
  dateLocale,
  labels,
}: {
  label: string;
  game: SportsTeamGame;
  teamName: string;
  teamLogo: string;
  hour12: boolean;
  dateLocale: ReturnType<typeof getDateLocale>;
  labels: SportsLabels;
}) {
  const isFinal = game.status === "final";
  const teamFirst = game.homeAway === "home";
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {teamFirst ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDNs, not local assets */}
            <img src={teamLogo} alt={teamName} className="h-7 w-7 object-contain" />
            {isFinal && <span className="text-sm font-semibold text-ink">{game.teamScore}</span>}
            <span className="text-xs text-soft">{isFinal ? "–" : labels.vs}</span>
            {isFinal && <span className="text-sm font-semibold text-ink">{game.opponentScore}</span>}
            {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDNs, not local assets */}
            <img src={game.opponentLogo} alt={game.opponentName} className="h-7 w-7 object-contain" />
          </>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDNs, not local assets */}
            <img src={game.opponentLogo} alt={game.opponentName} className="h-7 w-7 object-contain" />
            {isFinal && <span className="text-sm font-semibold text-ink">{game.opponentScore}</span>}
            <span className="text-xs text-soft">{isFinal ? "–" : labels.vs}</span>
            {isFinal && <span className="text-sm font-semibold text-ink">{game.teamScore}</span>}
            {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDNs, not local assets */}
            <img src={teamLogo} alt={teamName} className="h-7 w-7 object-contain" />
          </>
        )}
        <span className="text-xs text-soft">{game.opponentName}</span>
      </div>
      <p className="mt-0.5 text-xs text-soft">
        {isFinal ? (
          <>
            {labels.final} · {format(new Date(game.date), "MMM d", { locale: dateLocale })}
          </>
        ) : (
          <GameTime date={game.date} hour12={hour12} dateLocale={dateLocale} at={labels.at} />
        )}
      </p>
    </div>
  );
}

function SeriesGameRow({
  game,
  teamId,
  hour12,
  dateLocale,
  labels,
}: {
  game: MlbSeriesGame;
  teamId: number;
  hour12: boolean;
  dateLocale: ReturnType<typeof getDateLocale>;
  labels: SportsLabels;
}) {
  const isFinal = game.status === "final";
  const homeIsTeam = game.homeTeamId === teamId;
  const awayIsTeam = game.awayTeamId === teamId;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
        <img src={game.awayTeamLogo} alt={game.awayTeamName} className="h-5 w-5 object-contain" />
        <span className={clsx("text-xs", awayIsTeam ? TEAM_ACCENT : "text-ink/70")}>
          {isFinal ? game.awayScore : ""}
        </span>
        <span className="text-[10px] text-soft">{labels.at}</span>
        {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
        <img src={game.homeTeamLogo} alt={game.homeTeamName} className="h-5 w-5 object-contain" />
        <span className={clsx("text-xs", homeIsTeam ? TEAM_ACCENT : "text-ink/70")}>
          {isFinal ? game.homeScore : ""}
        </span>
      </div>
      <span className="text-[10px] text-soft">
        {isFinal ? (
          format(new Date(game.date), "MMM d", { locale: dateLocale })
        ) : (
          <GameTime date={game.date} hour12={hour12} dateLocale={dateLocale} at={labels.at} />
        )}
      </span>
    </div>
  );
}

function simpleSnapshotOf(snapshot: SportsCardSnapshot): TeamSnapshot | null {
  switch (snapshot.league) {
    case "NHL":
      return snapshot.nhl;
    case "NFL":
      return snapshot.nfl;
    case "CFL":
      return snapshot.cfl;
    case "MLS":
      return snapshot.mls;
    case "NBA":
      return snapshot.nba;
    case "MLB":
      return null;
  }
}

// A league with no last/next game, no postseason series, and no fetch/parse
// error has nothing to show — most often because its season hasn't started
// yet. Rather than rendering an "unavailable" placeholder for it, SportsCard
// filters these out entirely so the drop-down only lists leagues with
// something to say. A league that DID error (its API call failed, or the
// response didn't parse into any games) stays visible instead of silently
// vanishing — see LeagueSection below, which surfaces `errors` for it.
function hasLeagueData(snapshot: SportsCardSnapshot): boolean {
  const simple = simpleSnapshotOf(snapshot);
  const mlb = snapshot.league === "MLB" ? snapshot.mlb : null;
  const hasGames = Boolean(
    simple ? simple.lastGame || simple.nextGame : mlb ? mlb.seriesGames.length || mlb.lastGame || mlb.nextGame : false,
  );
  const hasErrors = (simple?.errors.length ?? mlb?.errors.length ?? 0) > 0;
  return hasGames || hasErrors;
}

// One league's block inside the drop-down — every league with data renders
// here (see SportsCard below, which filters out empty ones), not just the
// one picked in Settings for the compact header pill. Next Game only shows
// at sm+ (`hidden sm:block` on its own cell, not a prop) so the same markup
// self-adapts whichever pill's panel is currently showing it, without
// SportsCard needing to know which instance it is.
function LeagueSection({
  snapshot,
  hour12,
  dateLocale,
  labels,
}: {
  snapshot: SportsCardSnapshot;
  hour12: boolean;
  dateLocale: ReturnType<typeof getDateLocale>;
  labels: SportsLabels;
}) {
  const simple = simpleSnapshotOf(snapshot);
  const mlb = snapshot.league === "MLB" ? snapshot.mlb : null;
  const teamName = simple?.teamName ?? mlb?.teamName ?? "";
  const teamLogo = simple?.teamLogo ?? mlb?.teamLogo ?? "";
  const errors = simple?.errors ?? mlb?.errors ?? [];
  const hasGames = Boolean(
    simple ? simple.lastGame || simple.nextGame : mlb ? mlb.seriesGames.length || mlb.lastGame || mlb.nextGame : false,
  );

  // A league whose API call failed or whose response didn't parse into any
  // games still gets its own row (see hasLeagueData above) instead of
  // silently disappearing — this is what actually shows why, right in the
  // widget, rather than only in a snapshot field nothing ever displayed.
  if (!hasGames && errors.length > 0) {
    return (
      <div className="border-b border-card-border/60 pb-2 last:border-b-0 last:pb-0">
        <div className="flex items-center gap-1.5">
          {teamLogo && (
            // eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset
            <img src={teamLogo} alt={teamName} className="h-5 w-5 object-contain" />
          )}
          <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">
            {snapshot.league} · {teamName}
          </p>
        </div>
        <p className="mt-1 text-xs text-soft">{labels.unavailable}</p>
        <p className="mt-0.5 break-all font-mono text-[10px] text-soft/70">{errors.join(" · ")}</p>
      </div>
    );
  }

  return (
    <div className="border-b border-card-border/60 pb-2 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-1.5">
        {teamLogo && (
          // eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset
          <img src={teamLogo} alt={teamName} className="h-5 w-5 object-contain" />
        )}
        <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">
          {snapshot.league} · {mlb?.inPostseason ? labels.series : teamName}
        </p>
      </div>

      {simple ? (
        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {simple.lastGame && (
            <TeamGameRow
              label={labels.lastGame}
              game={simple.lastGame}
              teamName={simple.teamName}
              teamLogo={simple.teamLogo}
              hour12={hour12}
              dateLocale={dateLocale}
              labels={labels}
            />
          )}
          {simple.nextGame && (
            <div className="hidden sm:block">
              <TeamGameRow
                label={labels.nextGame}
                game={simple.nextGame}
                teamName={simple.teamName}
                teamLogo={simple.teamLogo}
                hour12={hour12}
                dateLocale={dateLocale}
                labels={labels}
              />
            </div>
          )}
        </div>
      ) : mlb ? (
        mlb.inPostseason ? (
          <div className="mt-1 divide-y divide-card-border/60">
            {mlb.seriesGames.map((game) => (
              <SeriesGameRow
                key={game.gameId}
                game={game}
                teamId={
                  game.homeTeamName === mlb.teamName
                    ? game.homeTeamId
                    : game.awayTeamName === mlb.teamName
                      ? game.awayTeamId
                      : -1
                }
                hour12={hour12}
                dateLocale={dateLocale}
                labels={labels}
              />
            ))}
          </div>
        ) : (
          <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mlb.lastGame && (
              <TeamGameRow
                label={labels.lastGame}
                game={mlb.lastGame}
                teamName={mlb.teamName}
                teamLogo={mlb.teamLogo}
                hour12={hour12}
                dateLocale={dateLocale}
                labels={labels}
              />
            )}
            {mlb.nextGame && (
              <div className="hidden sm:block">
                <TeamGameRow
                  label={labels.nextGame}
                  game={mlb.nextGame}
                  teamName={mlb.teamName}
                  teamLogo={mlb.teamLogo}
                  hour12={hour12}
                  dateLocale={dateLocale}
                  labels={labels}
                />
              </div>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}

// Full Sports card — shown as a click-to-open drop-down from the Dashboard
// header's compact pill (header-sports-widget.tsx), same pattern as
// Markets/News/World Clock: every configured league shows here (one
// LeagueSection each), not just the single league/team picked in Settings
// for the compact pill itself.
export default function SportsCard({
  initial,
  hour12,
  lang,
  labels,
}: {
  initial: SportsCardSnapshot[];
  hour12: boolean;
  lang: Lang;
  labels: SportsLabels;
}) {
  const [snapshots, setSnapshots] = useState(initial);
  const [loading, setLoading] = useState(false);
  const dateLocale = getDateLocale(lang);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/sports");
      if (res.ok) {
        const data = (await res.json()) as { snapshots: SportsCardSnapshot[] };
        setSnapshots(data.snapshots);
      }
    } catch {
      // Keep showing the last known snapshots rather than clearing them.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <RefreshButton onClick={refresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} />
      </div>

      <div className="mt-1.5 space-y-2 sm:mt-3">
        {snapshots.filter(hasLeagueData).map((snapshot) => (
          <LeagueSection
            key={snapshot.league}
            snapshot={snapshot}
            hour12={hour12}
            dateLocale={dateLocale}
            labels={labels}
          />
        ))}
      </div>
    </div>
  );
}
