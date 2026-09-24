"use client";

import { useState } from "react";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { SportsSnapshot, SportsTeamGame, MlbSeriesGame } from "@/lib/sports";
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

// Toronto Blue Jays blue — used to make their row/score stand out in the
// postseason series list, per "make the Toronto team prominent".
const BLUE_JAYS_ACCENT = "text-[#134A8E] font-semibold";

function GameTime({ date, hour12, dateLocale, at }: { date: string; hour12: boolean; dateLocale: ReturnType<typeof getDateLocale>; at: string }) {
  const d = new Date(date);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12 }).format(d);
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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">{label}</p>
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
  hour12,
  dateLocale,
  labels,
}: {
  game: MlbSeriesGame;
  hour12: boolean;
  dateLocale: ReturnType<typeof getDateLocale>;
  labels: SportsLabels;
}) {
  const isFinal = game.status === "final";
  const homeIsJays = game.homeTeamId === 141;
  const awayIsJays = game.awayTeamId === 141;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
        <img src={game.awayTeamLogo} alt={game.awayTeamName} className="h-5 w-5 object-contain" />
        <span className={clsx("text-xs", awayIsJays ? BLUE_JAYS_ACCENT : "text-ink/70")}>
          {isFinal ? game.awayScore : ""}
        </span>
        <span className="text-[10px] text-soft">{labels.at}</span>
        {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
        <img src={game.homeTeamLogo} alt={game.homeTeamName} className="h-5 w-5 object-contain" />
        <span className={clsx("text-xs", homeIsJays ? BLUE_JAYS_ACCENT : "text-ink/70")}>
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

export default function SportsCard({
  initial,
  lang,
  hour12,
  labels,
}: {
  initial: SportsSnapshot | null;
  lang: "en" | "fr";
  hour12: boolean;
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

  const hasNhl = Boolean(snapshot?.nhl.lastGame || snapshot?.nhl.nextGame);
  const hasMlb = Boolean(
    snapshot?.mlb.seriesGames.length || snapshot?.mlb.lastGame || snapshot?.mlb.nextGame
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <RefreshButton onClick={refresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} />
      </div>

      {!hasNhl && !hasMlb ? (
        <p className="mt-3 text-sm text-soft">{labels.unavailable}</p>
      ) : (
        <div className="mt-3 divide-y divide-card-border">
          {hasNhl && snapshot && (
            <div className="grid grid-cols-2 gap-3 py-2 first:pt-0">
              {snapshot.nhl.lastGame && (
                <TeamGameRow
                  label={labels.lastGame}
                  game={snapshot.nhl.lastGame}
                  teamName={snapshot.nhl.teamName}
                  teamLogo={snapshot.nhl.teamLogo}
                  hour12={hour12}
                  dateLocale={dateLocale}
                  labels={labels}
                />
              )}
              {snapshot.nhl.nextGame && (
                <TeamGameRow
                  label={labels.nextGame}
                  game={snapshot.nhl.nextGame}
                  teamName={snapshot.nhl.teamName}
                  teamLogo={snapshot.nhl.teamLogo}
                  hour12={hour12}
                  dateLocale={dateLocale}
                  labels={labels}
                />
              )}
            </div>
          )}

          {hasMlb && snapshot && (
            <div className="py-2 last:pb-0">
              <div className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
                <img src={snapshot.mlb.teamLogo} alt={snapshot.mlb.teamName} className="h-5 w-5 object-contain" />
                <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">
                  {snapshot.mlb.inPostseason ? labels.series : snapshot.mlb.teamName}
                </p>
              </div>

              {snapshot.mlb.inPostseason ? (
                <div className="mt-1 divide-y divide-card-border/60">
                  {snapshot.mlb.seriesGames.map((game) => (
                    <SeriesGameRow key={game.gameId} game={game} hour12={hour12} dateLocale={dateLocale} labels={labels} />
                  ))}
                </div>
              ) : (
                <div className="mt-1 grid grid-cols-2 gap-3">
                  {snapshot.mlb.lastGame && (
                    <TeamGameRow
                      label={labels.lastGame}
                      game={snapshot.mlb.lastGame}
                      teamName={snapshot.mlb.teamName}
                      teamLogo={snapshot.mlb.teamLogo}
                      hour12={hour12}
                      dateLocale={dateLocale}
                      labels={labels}
                    />
                  )}
                  {snapshot.mlb.nextGame && (
                    <TeamGameRow
                      label={labels.nextGame}
                      game={snapshot.mlb.nextGame}
                      teamName={snapshot.mlb.teamName}
                      teamLogo={snapshot.mlb.teamLogo}
                      hour12={hour12}
                      dateLocale={dateLocale}
                      labels={labels}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
