import { format } from "date-fns";
import { getNhlSnapshot, getMlbSnapshot } from "@/lib/sports";
import type { SportsLeague } from "@/lib/dashboard-sports-picks";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { Lang } from "@/lib/i18n/dictionaries";
import HeaderSportsWidget, { type SportsHeaderPick } from "./header-sports-widget";
import type { SportsCardSnapshot, SportsLabels } from "./sports-card";

async function loadPick(
  league: SportsLeague,
  teamNhl: string,
  teamMlb: string,
  dateLocale: ReturnType<typeof getDateLocale>,
): Promise<{ pick: SportsHeaderPick; cardSnapshot: SportsCardSnapshot }> {
  if (league === "MLB") {
    const snapshot = await getMlbSnapshot(Number(teamMlb));
    return {
      pick: {
        game: snapshot.lastGame,
        teamLogo: snapshot.teamLogo,
        teamName: snapshot.teamName,
        gameDateLabel: snapshot.lastGame
          ? format(new Date(snapshot.lastGame.date), "MMM d", { locale: dateLocale })
          : null,
      },
      cardSnapshot: { league: "MLB", mlb: snapshot },
    };
  }
  const snapshot = await getNhlSnapshot(teamNhl);
  return {
    pick: {
      game: snapshot.lastGame,
      teamLogo: snapshot.teamLogo,
      teamName: snapshot.teamName,
      gameDateLabel: snapshot.lastGame
        ? format(new Date(snapshot.lastGame.date), "MMM d", { locale: dateLocale })
        : null,
    },
    cardSnapshot: { league: "NHL", nhl: snapshot },
  };
}

// Dedicated async Server Component so this (real network) fetch sits behind
// its own <Suspense> boundary in the Dashboard header, same reasoning as
// weather-header-server.tsx. `league`/`teamNhl`/`teamMlb` come from the
// signed-in user's own picks (see src/lib/dashboard-sports-picks.ts),
// resolved by the caller inside its own withScopedPrismaClient block
// rather than here, so this component never opens its own Prisma client.
// `leagueMobile` can name a *different* league to show on the mobile pill
// than the desktop one — when it does, this fetches both leagues' data
// (one extra network call) so each pill gets its own game and its own
// drop-down card; when it matches (the common case), only one fetch runs
// and both pills share it.
export default async function SportsHeaderServer({
  league,
  teamNhl,
  teamMlb,
  leagueMobile,
  lang,
  hour12,
  cardLabels,
  unavailableLabel,
}: {
  league: SportsLeague;
  teamNhl: string;
  teamMlb: string;
  leagueMobile: SportsLeague;
  lang: Lang;
  hour12: boolean;
  cardLabels: SportsLabels;
  unavailableLabel: string;
}) {
  const dateLocale = getDateLocale(lang);
  const desktop = await loadPick(league, teamNhl, teamMlb, dateLocale);
  const mobile = leagueMobile === league ? desktop : await loadPick(leagueMobile, teamNhl, teamMlb, dateLocale);
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
