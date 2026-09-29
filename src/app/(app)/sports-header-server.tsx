import { format } from "date-fns";
import {
  getNhlSnapshot,
  getMlbSnapshot,
  getNflSnapshot,
  getCflSnapshot,
  getMlsSnapshot,
  getNbaSnapshot,
  type SportsTeamGame,
  type TeamSnapshot,
  type MlbSnapshot,
} from "@/lib/sports";
import type { SportsLeague } from "@/lib/dashboard-sports-picks";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { Lang } from "@/lib/i18n/dictionaries";
import HeaderSportsWidget, { type SportsHeaderPick } from "./header-sports-widget";
import type { SportsCardSnapshot, SportsLabels } from "./sports-card";

export interface SportsTeamPicks {
  nhl: string;
  mlb: string;
  nfl: string;
  cfl: string;
  mls: string;
  nba: string;
}

// date-fns v4's format() throws a RangeError on an invalid Date instead of
// returning something — so a game whose `date` field didn't come back in a
// shape `new Date()` can parse (this session can't confirm ESPN's exact
// format live) would crash this component synchronously on every Dashboard
// render, not just fail to show a date. That's likely exactly what started
// happening once the ESPN team-matching fix above made NFL/CFL/MLS actually
// return real games instead of always being empty — this code path was
// simply never reached before.
function safeFormatDate(dateStr: string, pattern: string, dateLocale: ReturnType<typeof getDateLocale>): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return format(d, pattern, { locale: dateLocale });
  } catch {
    return null;
  }
}

// Every league's snapshot shares this same lastGame/teamLogo/teamName shape
// (MLB's own extra postseason-series fields just go unused here) — one
// mapping to the header pill's shape covers all 6 leagues.
function toPick(
  snapshot: { lastGame: SportsTeamGame | null; teamLogo: string; teamName: string },
  dateLocale: ReturnType<typeof getDateLocale>,
): SportsHeaderPick {
  return {
    game: snapshot.lastGame,
    teamLogo: snapshot.teamLogo,
    teamName: snapshot.teamName,
    gameDateLabel: snapshot.lastGame ? safeFormatDate(snapshot.lastGame.date, "MMM d", dateLocale) : null,
  };
}

function pickBase(snapshot: SportsCardSnapshot): { lastGame: SportsTeamGame | null; teamLogo: string; teamName: string } {
  switch (snapshot.league) {
    case "NHL":
      return snapshot.nhl;
    case "MLB":
      return snapshot.mlb;
    case "NFL":
      return snapshot.nfl;
    case "CFL":
      return snapshot.cfl;
    case "MLS":
      return snapshot.mls;
    case "NBA":
      return snapshot.nba;
  }
}

// Every get*Snapshot function is documented as never throwing (see
// sports.ts's own header comment) — but this is the one place a slip there,
// or a genuinely unexpected runtime failure, would matter: Promise.all
// rejects as soon as ANY of its six promises rejects, and since this whole
// function is awaited with nothing catching it below, that rejection would
// propagate straight past this component's Suspense boundary to the nearest
// error boundary — which, with nothing scoped more narrowly, can take the
// entire Dashboard down (including the completely unrelated Weather/Markets
// widgets) instead of just this one Sports widget going blank. allSettled +
// a safe per-league fallback below means a single league's fetch failing,
// however it fails, can never do more than show "unavailable" for that one
// league.
function failedTeamSnapshot(teamName: string, message: string): TeamSnapshot {
  return { teamName, teamLogo: "", lastGame: null, nextGame: null, errors: [message] };
}

function failedMlbSnapshot(teamName: string, message: string): MlbSnapshot {
  return { teamName, teamLogo: "", inPostseason: false, seriesGames: [], lastGame: null, nextGame: null, errors: [message] };
}

function settledMessage(result: PromiseSettledResult<unknown>): string {
  if (result.status !== "rejected") return "";
  const reason = result.reason;
  return reason instanceof Error ? reason.message : String(reason);
}

// Fetches every league's snapshot in parallel — six independent external API
// calls, not Postgres connections, so unlike this app's DB queries there's
// no Cloudflare Hyperdrive connection-limit reason to serialize these — and
// returns them in SPORTS_LEAGUE_OPTIONS order. The expanded drop-down card
// (sports-card.tsx) now shows every league at once, so this always loads all
// six rather than just the one or two the user has picked to show in the
// compact header pill.
async function loadAllSnapshots(teams: SportsTeamPicks): Promise<SportsCardSnapshot[]> {
  const [nhlR, mlbR, nflR, cflR, mlsR, nbaR] = await Promise.allSettled([
    getNhlSnapshot(teams.nhl),
    getMlbSnapshot(Number(teams.mlb)),
    getNflSnapshot(teams.nfl),
    getCflSnapshot(teams.cfl),
    getMlsSnapshot(teams.mls),
    getNbaSnapshot(teams.nba),
  ]);
  const nhl = nhlR.status === "fulfilled" ? nhlR.value : failedTeamSnapshot(teams.nhl, `nhl: ${settledMessage(nhlR)}`);
  const mlb = mlbR.status === "fulfilled" ? mlbR.value : failedMlbSnapshot(teams.mlb, `mlb: ${settledMessage(mlbR)}`);
  const nfl = nflR.status === "fulfilled" ? nflR.value : failedTeamSnapshot(teams.nfl, `nfl: ${settledMessage(nflR)}`);
  const cfl = cflR.status === "fulfilled" ? cflR.value : failedTeamSnapshot(teams.cfl, `cfl: ${settledMessage(cflR)}`);
  const mls = mlsR.status === "fulfilled" ? mlsR.value : failedTeamSnapshot(teams.mls, `mls: ${settledMessage(mlsR)}`);
  const nba = nbaR.status === "fulfilled" ? nbaR.value : failedTeamSnapshot(teams.nba, `nba: ${settledMessage(nbaR)}`);
  return [
    { league: "NHL", nhl },
    { league: "MLB", mlb },
    { league: "NFL", nfl },
    { league: "CFL", cfl },
    { league: "MLS", mls },
    { league: "NBA", nba },
  ];
}

// Dedicated async Server Component so this (real network) fetch sits behind
// its own <Suspense> boundary in the Dashboard header, same reasoning as
// weather-header-server.tsx. `league`/`teams` come from the signed-in
// user's own picks (see src/lib/dashboard-sports-picks.ts), resolved by the
// caller inside its own withScopedPrismaClient block rather than here, so
// this component never opens its own Prisma client.
// `league`/`leagueMobile` only pick which league's score shows in the
// compact header pill on desktop vs. mobile — the expanded drop-down card
// both pills open shows every league regardless, built from the one shared
// `loadAllSnapshots` fetch above.
export default async function SportsHeaderServer({
  league,
  teams,
  leagueMobile,
  lang,
  hour12,
  cardLabels,
  unavailableLabel,
}: {
  league: SportsLeague;
  teams: SportsTeamPicks;
  leagueMobile: SportsLeague;
  lang: Lang;
  hour12: boolean;
  cardLabels: SportsLabels;
  unavailableLabel: string;
}) {
  const dateLocale = getDateLocale(lang);
  const allSnapshots = await loadAllSnapshots(teams);
  const byLeague = new Map(allSnapshots.map((s) => [s.league, s]));

  const desktopSnapshot = byLeague.get(league) ?? allSnapshots[0];
  const mobileSnapshot = byLeague.get(leagueMobile) ?? desktopSnapshot;
  const desktopPick = toPick(pickBase(desktopSnapshot), dateLocale);
  const mobilePick = toPick(pickBase(mobileSnapshot), dateLocale);

  return (
    <HeaderSportsWidget
      desktop={desktopPick}
      mobile={mobilePick}
      allSnapshots={allSnapshots}
      hour12={hour12}
      lang={lang}
      cardLabels={cardLabels}
      unavailableLabel={unavailableLabel}
    />
  );
}
