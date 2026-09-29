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

// Full Sports card — shown as a click-to-open drop-down from the Dashboard
// header's compact pill (header-sports-widget.tsx), same pattern as
// Markets/News. Unlike the old full-width dashboard card this replaced,
// it shows only the one league/team picked in Settings (see
// src/lib/dashboard-sports-picks.ts) rather than NHL + MLB side by side.
export default function SportsCard({
  initial,
  hour12,
  lang,
  labels,
}: {
  initial: SportsCardSnapshot | null;
  hour12: boolean;
  lang: Lang;
  labels: SportsLabels;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [loading, setLoading] = useState(false);
  const dateLocale = getDateLocale(lang);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/sports");
      if (res.ok) setSnapshot(await res.json());
    } catch {
      // Keep showing the last known snapshot rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

  // NHL/NFL/CFL/MLS/NBA all render the same simple last-game/next-game way
  // (no postseason-series special case like MLB gets below).
  const simple: TeamSnapshot | null =
    snapshot?.league === "NHL"
      ? snapshot.nhl
      : snapshot?.league === "NFL"
        ? snapshot.nfl
        : snapshot?.league === "CFL"
          ? snapshot.cfl
          : snapshot?.league === "MLS"
            ? snapshot.mls
            : snapshot?.league === "NBA"
              ? snapshot.nba
              : null;
  const mlb = snapshot?.league === "MLB" ? snapshot.mlb : null;
  const hasData = Boolean(
    simple ? simple.lastGame || simple.nextGame : mlb ? mlb.seriesGames.length || mlb.lastGame || mlb.nextGame : false,
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <RefreshButton onClick={refresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} />
      </div>

      {!hasData ? (
        <p className="mt-1.5 sm:mt-3 text-sm text-soft">{labels.unavailable}</p>
      ) : simple ? (
        <div className="mt-1.5 sm:mt-3 grid grid-cols-2 gap-3">
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
            <TeamGameRow
              label={labels.nextGame}
              game={simple.nextGame}
              teamName={simple.teamName}
              teamLogo={simple.teamLogo}
              hour12={hour12}
              dateLocale={dateLocale}
              labels={labels}
            />
          )}
        </div>
      ) : mlb ? (
        <div className="mt-1.5 sm:mt-3">
          <div className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
            <img src={mlb.teamLogo} alt={mlb.teamName} className="h-5 w-5 object-contain" />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">
              {mlb.inPostseason ? labels.series : mlb.teamName}
            </p>
          </div>

          {mlb.inPostseason ? (
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
            <div className="mt-1 grid grid-cols-2 gap-3">
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
                <TeamGameRow
                  label={labels.nextGame}
                  game={mlb.nextGame}
                  teamName={mlb.teamName}
                  teamLogo={mlb.teamLogo}
                  hour12={hour12}
                  dateLocale={dateLocale}
                  labels={labels}
                />
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
