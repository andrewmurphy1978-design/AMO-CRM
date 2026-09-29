import type { PrismaClient } from "@/lib/prisma";

// Defaults + helpers for the customizable Dashboard header Sports widget:
// the user picks one active league to show (NHL or MLB today; NBA, NFL,
// CFL, MLS, and European soccer leagues are meant to slot in later — see
// SPORTS_LEAGUE_OPTIONS) plus a home team *for each* league, so switching
// leagues later doesn't lose the other league's team pick. Both are stored
// as plain strings on User (null meaning "use these defaults") — same
// reasoning as src/lib/world-clock-zones.ts and dashboard-markets-picks.ts.
//
// The team labels below are duplicated from src/lib/sports.ts's own
// NHL_TEAM_NAMES/MLB_TEAM_NAMES maps rather than imported from it, so this
// file — used by the Settings form Client Component — never pulls that
// module's server-only fetch functions into the client bundle. Keep the
// lists in sync if either changes.
export type SportsLeague = "NHL" | "MLB";

export const SPORTS_LEAGUE_OPTIONS: { value: SportsLeague; label: string }[] = [
  { value: "NHL", label: "NHL" },
  { value: "MLB", label: "MLB" },
];

export const DEFAULT_SPORTS_LEAGUE: SportsLeague = "NHL";
export const DEFAULT_SPORTS_TEAM_NHL = "MTL";
export const DEFAULT_SPORTS_TEAM_MLB = "141";

export const NHL_TEAM_OPTIONS: { value: string; label: string }[] = [
  { value: "ANA", label: "Anaheim Ducks" },
  { value: "ARI", label: "Arizona Coyotes" },
  { value: "BOS", label: "Boston Bruins" },
  { value: "BUF", label: "Buffalo Sabres" },
  { value: "CGY", label: "Calgary Flames" },
  { value: "CAR", label: "Carolina Hurricanes" },
  { value: "CHI", label: "Chicago Blackhawks" },
  { value: "COL", label: "Colorado Avalanche" },
  { value: "CBJ", label: "Columbus Blue Jackets" },
  { value: "DAL", label: "Dallas Stars" },
  { value: "DET", label: "Detroit Red Wings" },
  { value: "EDM", label: "Edmonton Oilers" },
  { value: "FLA", label: "Florida Panthers" },
  { value: "LAK", label: "Los Angeles Kings" },
  { value: "MIN", label: "Minnesota Wild" },
  { value: "MTL", label: "Montreal Canadiens" },
  { value: "NSH", label: "Nashville Predators" },
  { value: "NJD", label: "New Jersey Devils" },
  { value: "NYI", label: "New York Islanders" },
  { value: "NYR", label: "New York Rangers" },
  { value: "OTT", label: "Ottawa Senators" },
  { value: "PHI", label: "Philadelphia Flyers" },
  { value: "PIT", label: "Pittsburgh Penguins" },
  { value: "SEA", label: "Seattle Kraken" },
  { value: "SJS", label: "San Jose Sharks" },
  { value: "STL", label: "St. Louis Blues" },
  { value: "TBL", label: "Tampa Bay Lightning" },
  { value: "TOR", label: "Toronto Maple Leafs" },
  { value: "UTA", label: "Utah Hockey Club" },
  { value: "VAN", label: "Vancouver Canucks" },
  { value: "VGK", label: "Vegas Golden Knights" },
  { value: "WSH", label: "Washington Capitals" },
  { value: "WPG", label: "Winnipeg Jets" },
];

export const MLB_TEAM_OPTIONS: { value: string; label: string }[] = [
  { value: "109", label: "Arizona Diamondbacks" },
  { value: "144", label: "Atlanta Braves" },
  { value: "110", label: "Baltimore Orioles" },
  { value: "111", label: "Boston Red Sox" },
  { value: "112", label: "Chicago Cubs" },
  { value: "145", label: "Chicago White Sox" },
  { value: "113", label: "Cincinnati Reds" },
  { value: "114", label: "Cleveland Guardians" },
  { value: "115", label: "Colorado Rockies" },
  { value: "116", label: "Detroit Tigers" },
  { value: "117", label: "Houston Astros" },
  { value: "118", label: "Kansas City Royals" },
  { value: "108", label: "Los Angeles Angels" },
  { value: "119", label: "Los Angeles Dodgers" },
  { value: "146", label: "Miami Marlins" },
  { value: "158", label: "Milwaukee Brewers" },
  { value: "142", label: "Minnesota Twins" },
  { value: "121", label: "New York Mets" },
  { value: "147", label: "New York Yankees" },
  { value: "133", label: "Oakland Athletics" },
  { value: "143", label: "Philadelphia Phillies" },
  { value: "134", label: "Pittsburgh Pirates" },
  { value: "135", label: "San Diego Padres" },
  { value: "137", label: "San Francisco Giants" },
  { value: "136", label: "Seattle Mariners" },
  { value: "138", label: "St. Louis Cardinals" },
  { value: "139", label: "Tampa Bay Rays" },
  { value: "140", label: "Texas Rangers" },
  { value: "141", label: "Toronto Blue Jays" },
  { value: "120", label: "Washington Nationals" },
];

export function effectiveSportsLeague(stored: string | null): SportsLeague {
  return stored === "NHL" || stored === "MLB" ? stored : DEFAULT_SPORTS_LEAGUE;
}

export function effectiveSportsTeamNhl(stored: string | null): string {
  return stored && NHL_TEAM_OPTIONS.some((o) => o.value === stored) ? stored : DEFAULT_SPORTS_TEAM_NHL;
}

export function effectiveSportsTeamMlb(stored: string | null): string {
  return stored && MLB_TEAM_OPTIONS.some((o) => o.value === stored) ? stored : DEFAULT_SPORTS_TEAM_MLB;
}

// The Dashboard header's Sports widget can show a different league on
// mobile than on desktop (e.g. NHL on desktop, MLB on mobile) — this
// resolves that pick, falling back to the desktop league when unset.
export function effectiveSportsLeagueMobile(stored: string | null, desktopLeague: SportsLeague): SportsLeague {
  return stored === "NHL" || stored === "MLB" ? stored : desktopLeague;
}

// Reads the signed-in user's own Sports picks fresh from the DB — same
// "session is only reissued at login" reasoning as getUserWorldClockZones.
export async function getUserSportsPicks(
  session: { user: { id: string } } | null,
  db: PrismaClient,
): Promise<{ league: SportsLeague; teamNhl: string; teamMlb: string; leagueMobile: SportsLeague }> {
  if (!session) {
    return {
      league: DEFAULT_SPORTS_LEAGUE,
      teamNhl: DEFAULT_SPORTS_TEAM_NHL,
      teamMlb: DEFAULT_SPORTS_TEAM_MLB,
      leagueMobile: DEFAULT_SPORTS_LEAGUE,
    };
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { sportsLeague: true, sportsTeamNhl: true, sportsTeamMlb: true, sportsLeagueMobile: true },
  });
  const league = effectiveSportsLeague(user?.sportsLeague ?? null);
  return {
    league,
    teamNhl: effectiveSportsTeamNhl(user?.sportsTeamNhl ?? null),
    teamMlb: effectiveSportsTeamMlb(user?.sportsTeamMlb ?? null),
    leagueMobile: effectiveSportsLeagueMobile(user?.sportsLeagueMobile ?? null, league),
  };
}
