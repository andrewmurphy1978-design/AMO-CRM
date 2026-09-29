"use client";

import { useState } from "react";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
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

// date-fns v4's format() throws on an invalid Date rather than returning
// something — used everywhere a game's own `date` field gets formatted
// below, since this session can't confirm live that every league's date
// string is always something `new Date()` parses cleanly.
function safeFormatDate(dateStr: string, pattern: string, dateLocale: ReturnType<typeof getDateLocale>): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return format(d, pattern, { locale: dateLocale });
  } catch {
    return "";
  }
}

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
  // Intl.DateTimeFormat#format and date-fns' format() both throw on an
  // invalid Date rather than returning something — see safeFormatDate above.
  if (Number.isNaN(d.getTime())) return null;
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

// An empty `src` on an <img> makes the browser re-request the current page
// URL — a real bug, not just a missing icon — which is a live possibility
// now that TheSportsDB-backed leagues (NFL/CFL/MLS/NBA) fall back to "" when
// a badge lookup fails, unlike the old ESPN/NHL/MLB code's guessed-CDN-URL
// fallbacks that were never actually empty.
function TeamLogo({ src, alt, sizeClassName = "h-7 w-7" }: { src: string; alt: string; sizeClassName?: string }) {
  if (!src) return <div className={`${sizeClassName} shrink-0`} />;
  // eslint-disable-next-line @next/next/no-img-element -- external team-logo CDNs, not local assets
  return <img src={src} alt={alt} className={`${sizeClassName} shrink-0 object-contain`} />;
}

function TeamGameRow({
  label,
  game,
  teamName,
  teamLogo,
  hour12,
  dateLocale,
  labels,
  logoSizeClassName,
}: {
  label: string;
  game: SportsTeamGame;
  teamName: string;
  teamLogo: string;
  hour12: boolean;
  dateLocale: ReturnType<typeof getDateLocale>;
  labels: SportsLabels;
  // NHL's own SVG logos (assets.nhle.com) carry a lot of internal padding
  // around the actual mark, unlike the tightly-cropped ESPN/Wikipedia PNGs
  // every other league uses — at the same box size they render visibly
  // smaller, so NHL gets a larger box to compensate and look the same size.
  logoSizeClassName?: string;
}) {
  const isFinal = game.status === "final";
  const teamFirst = game.homeAway === "home";
  return (
    // min-w-0 here (both as this grid cell's own sizing and as the ancestor
    // the flex row's truncation below depends on) is load-bearing — without
    // it, a grid item's default min-width:auto keeps a long opponent name
    // (e.g. "Toronto Maple Leafs") at its full intrinsic width, overflowing
    // this narrow two-column layout and visually overlapping the other
    // column instead of wrapping or truncating.
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">
        {label}
      </p>
      <div className="mt-1 flex min-w-0 items-center gap-1.5">
        {teamFirst ? (
          <>
            <TeamLogo src={teamLogo} alt={teamName} sizeClassName={logoSizeClassName} />
            {isFinal && <span className="shrink-0 text-sm font-semibold text-ink">{game.teamScore}</span>}
            <span className="shrink-0 text-xs text-soft">{isFinal ? "–" : labels.vs}</span>
            {isFinal && <span className="shrink-0 text-sm font-semibold text-ink">{game.opponentScore}</span>}
            <TeamLogo src={game.opponentLogo} alt={game.opponentName} sizeClassName={logoSizeClassName} />
          </>
        ) : (
          <>
            <TeamLogo src={game.opponentLogo} alt={game.opponentName} sizeClassName={logoSizeClassName} />
            {isFinal && <span className="shrink-0 text-sm font-semibold text-ink">{game.opponentScore}</span>}
            <span className="shrink-0 text-xs text-soft">{isFinal ? "–" : labels.vs}</span>
            {isFinal && <span className="shrink-0 text-sm font-semibold text-ink">{game.teamScore}</span>}
            <TeamLogo src={teamLogo} alt={teamName} sizeClassName={logoSizeClassName} />
          </>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-soft">{game.opponentName}</span>
      </div>
      <p className="mt-0.5 truncate text-xs text-soft">
        {isFinal ? (
          <>
            {labels.final} · {safeFormatDate(game.date, "MMM d", dateLocale)}
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
          safeFormatDate(game.date, "MMM d", dateLocale)
        ) : (
          <GameTime date={game.date} hour12={hour12} dateLocale={dateLocale} at={labels.at} />
        )}
      </span>
    </div>
  );
}

// The last-game/next-game pair every non-postseason league shows — but
// either half can legitimately be absent for a reason worth explaining
// instead of just rendering one column and leaving the other blank: no
// last game at all (the season hasn't started yet, e.g. NBA in early fall)
// shows when the season starts instead, and a last game with no next game
// (the regular season just ended, e.g. MLB once the Blue Jays miss the
// playoffs) says so instead of silently having nothing there.
function SimpleGamesGrid({
  lastGame,
  nextGame,
  teamName,
  teamLogo,
  hour12,
  dateLocale,
  lang,
  labels,
  logoSizeClassName,
}: {
  lastGame: SportsTeamGame | null;
  nextGame: SportsTeamGame | null;
  teamName: string;
  teamLogo: string;
  hour12: boolean;
  dateLocale: ReturnType<typeof getDateLocale>;
  // The "season starts on"/"regular season finished" strings are read
  // straight off the dictionary here (via `lang`) rather than through
  // `labels`, since `sportsSeasonStartsOn` is a function — and a Server
  // Component (page.tsx builds `labels` server-side) can never pass a
  // plain function down into a Client Component prop; React throws
  // "Functions cannot be passed directly to Client Components" the moment
  // it tries to serialize one, which was crashing the whole Dashboard.
  lang: Lang;
  labels: SportsLabels;
  logoSizeClassName?: string;
}) {
  const t = getDict(lang);
  return (
    <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {lastGame ? (
        <TeamGameRow
          label={labels.lastGame}
          game={lastGame}
          teamName={teamName}
          teamLogo={teamLogo}
          hour12={hour12}
          dateLocale={dateLocale}
          labels={labels}
          logoSizeClassName={logoSizeClassName}
        />
      ) : nextGame ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">{labels.lastGame}</p>
          <p className="mt-1 text-xs text-soft">{t.dashboard.sportsSeasonStartsOn(safeFormatDate(nextGame.date, "MMM d", dateLocale))}</p>
        </div>
      ) : null}
      {nextGame ? (
        <TeamGameRow
          label={labels.nextGame}
          game={nextGame}
          teamName={teamName}
          teamLogo={teamLogo}
          hour12={hour12}
          dateLocale={dateLocale}
          labels={labels}
          logoSizeClassName={logoSizeClassName}
        />
      ) : lastGame ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">{labels.nextGame}</p>
          <p className="mt-1 text-xs text-soft">{t.dashboard.sportsRegularSeasonFinished}</p>
        </div>
      ) : null}
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
  lang,
  labels,
}: {
  snapshot: SportsCardSnapshot;
  hour12: boolean;
  dateLocale: ReturnType<typeof getDateLocale>;
  lang: Lang;
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
        <SimpleGamesGrid
          lastGame={simple.lastGame}
          nextGame={simple.nextGame}
          teamName={simple.teamName}
          teamLogo={simple.teamLogo}
          hour12={hour12}
          dateLocale={dateLocale}
          lang={lang}
          labels={labels}
          logoSizeClassName={snapshot.league === "NHL" ? "h-9 w-9" : undefined}
        />
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
          <SimpleGamesGrid
            lastGame={mlb.lastGame}
            nextGame={mlb.nextGame}
            teamName={mlb.teamName}
            teamLogo={mlb.teamLogo}
            hour12={hour12}
            dateLocale={dateLocale}
            lang={lang}
            labels={labels}
          />
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
            lang={lang}
            labels={labels}
          />
        ))}
      </div>
    </div>
  );
}
