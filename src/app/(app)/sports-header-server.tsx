import { getNhlSnapshot, getMlbSnapshot } from "@/lib/sports";
import type { SportsLeague } from "@/lib/dashboard-sports-picks";
import HeaderSportsWidget from "./header-sports-widget";

// Dedicated async Server Component so this (real network) fetch sits behind
// its own <Suspense> boundary in the Dashboard header, same reasoning as
// weather-header-server.tsx. `league`/`teamNhl`/`teamMlb` come from the
// signed-in user's own picks (see src/lib/dashboard-sports-picks.ts),
// resolved by the caller inside its own withScopedPrismaClient block
// rather than here, so this component never opens its own Prisma client.
export default async function SportsHeaderServer({
  league,
  teamNhl,
  teamMlb,
  unavailableLabel,
}: {
  league: SportsLeague;
  teamNhl: string;
  teamMlb: string;
  unavailableLabel: string;
}) {
  if (league === "MLB") {
    const snapshot = await getMlbSnapshot(Number(teamMlb));
    return (
      <HeaderSportsWidget
        game={snapshot.lastGame}
        teamLogo={snapshot.teamLogo}
        teamName={snapshot.teamName}
        unavailableLabel={unavailableLabel}
      />
    );
  }
  const snapshot = await getNhlSnapshot(teamNhl);
  return (
    <HeaderSportsWidget
      game={snapshot.lastGame}
      teamLogo={snapshot.teamLogo}
      teamName={snapshot.teamName}
      unavailableLabel={unavailableLabel}
    />
  );
}
