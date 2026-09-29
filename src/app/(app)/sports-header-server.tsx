import { format } from "date-fns";
import {
  getNhlSnapshot,
  getMlbSnapshot,
  getNflSnapshot,
  getCflSnapshot,
  getMlsSnapshot,
  getNbaSnapshot,
  type SportsTeamGame,
} from "@/lib/sports";
import type { SportsLeague } from "@/lib/dashboard-sports-picks";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { Lang } from "@/lib/i18n/dictionaries";
import HeaderSportsWidget, { type SportsHeaderPick } from "./header-sports-widget";
import type { SportsCardSnapshot, SportsLabels } from "./sports-card";

interface SportsTeamPicks {
  nhl: string;
  mlb: string;
  nfl: string;
  cfl: string;
  mls: string;
  nba: string;
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
    gameDateLabel: snapshot.lastGame
      ? format(new Date(snapshot.lastGame.date), "MMM d", { locale: dateLocale })
      : null,
  };
}

async function loadPick(
  league: SportsLeague,
  teams: SportsTeamPicks,
  dateLocale: ReturnType<typeof getDateLocale>,
): Promise<{ pick: SportsHeaderPick; cardSnapshot: SportsCardSnapshot }> {
  switch (league) {
    case "MLB": {
      const snapshot = await getMlbSnapshot(Number(teams.mlb));
      return { pick: toPick(snapshot, dateLocale), cardSnapshot: { league: "MLB", mlb: snapshot } };
    }
    case "NFL": {
      const snapshot = await getNflSnapshot(teams.nfl);
      return { pick: toPick(snapshot, dateLocale), cardSnapshot: { league: "NFL", nfl: snapshot } };
    }
    case "CFL": {
      const snapshot = await getCflSnapshot(teams.cfl);
      return { pick: toPick(snapshot, dateLocale), cardSnapshot: { league: "CFL", cfl: snapshot } };
    }
    case "MLS": {
      const snapshot = await getMlsSnapshot(teams.mls);
      return { pick: toPick(snapshot, dateLocale), cardSnapshot: { league: "MLS", mls: snapshot } };
    }
    case "NBA": {
      const snapshot = await getNbaSnapshot(teams.nba);
      return { pick: toPick(snapshot, dateLocale), cardSnapshot: { league: "NBA", nba: snapshot } };
    }
    default: {
      const snapshot = await getNhlSnapshot(teams.nhl);
      return { pick: toPick(snapshot, dateLocale), cardSnapshot: { league: "NHL", nhl: snapshot } };
    }
  }
}

// Dedicated async Server Component so this (real network) fetch sits behind
// its own <Suspense> boundary in the Dashboard header, same reasoning as
// weather-header-server.tsx. `league`/`teams` come from the signed-in
// user's own picks (see src/lib/dashboard-sports-picks.ts), resolved by the
// caller inside its own withScopedPrismaClient block rather than here, so
// this component never opens its own Prisma client.
// `leagueMobile` can name a *different* league to show on the mobile pill
// than the desktop one — when it does, this fetches both leagues' data
// (one extra network call) so each pill gets its own game and its own
// drop-down card; when it matches (the common case), only one fetch runs
// and both pills share it.
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
  const desktop = await loadPick(league, teams, dateLocale);
  const mobile = leagueMobile === league ? desktop : await loadPick(leagueMobile, teams, dateLocale);
  return (
    <HeaderSportsWidget
      desktop={desktop.pick}
      desktopCardSnapshot={desktop.cardSnapshot}
      mobile={mobile.pick}
      mobileCardSnapshot={mobile.cardSnapshot}
      hour12={hour12}
      lang={lang}
      cardLabels={cardLabels}
      unavailableLabel={unavailableLabel}
    />
  );
}
