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

export interface SportsTeamPicks {
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

// Fetches every league's snapshot in parallel — six independent external API
// calls, not Postgres connections, so unlike this app's DB queries there's
// no Cloudflare Hyperdrive connection-limit reason to serialize these — and
// returns them in SPORTS_LEAGUE_OPTIONS order. The expanded drop-down card
// (sports-card.tsx) now shows every league at once, so this always loads all
// six rather than just the one or two the user has picked to show in the
// compact header pill.
async function loadAllSnapshots(teams: SportsTeamPicks): Promise<SportsCardSnapshot[]> {
  const [nhl, mlb, nfl, cfl, mls, nba] = await Promise.all([
    getNhlSnapshot(teams.nhl),
    getMlbSnapshot(Number(teams.mlb)),
    getNflSnapshot(teams.nfl),
    getCflSnapshot(teams.cfl),
    getMlsSnapshot(teams.mls),
    getNbaSnapshot(teams.nba),
  ]);
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
