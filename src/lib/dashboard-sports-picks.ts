import type { PrismaClient } from "@/lib/prisma";

// Defaults + helpers for the customizable Dashboard header Sports widget:
// the user picks one active league to show, plus a home team *for each*
// league, so switching leagues later doesn't lose any other league's team
// pick. Both are stored as plain strings on User (null meaning "use these
// defaults") — same reasoning as src/lib/world-clock-zones.ts and
// dashboard-markets-picks.ts.
//
// The team labels below are duplicated from src/lib/sports.ts's own
// *_TEAM_NAMES maps rather than imported from it, so this file — used by
// the Settings form Client Component — never pulls that module's
// server-only fetch functions into the client bundle. Keep the lists in
// sync if either changes.
export type SportsLeague = "NHL" | "MLB" | "NFL" | "CFL" | "MLS" | "NBA";

export const SPORTS_LEAGUE_OPTIONS: { value: SportsLeague; label: string }[] = [
  { value: "NHL", label: "NHL" },
  { value: "MLB", label: "MLB" },
  { value: "NFL", label: "NFL" },
  { value: "CFL", label: "CFL" },
  { value: "MLS", label: "MLS" },
  { value: "NBA", label: "NBA" },
];

export const DEFAULT_SPORTS_LEAGUE: SportsLeague = "NHL";
export const DEFAULT_SPORTS_TEAM_NHL = "MTL";
export const DEFAULT_SPORTS_TEAM_MLB = "141";
export const DEFAULT_SPORTS_TEAM_NFL = "NE";
export const DEFAULT_SPORTS_TEAM_CFL = "MTL";
export const DEFAULT_SPORTS_TEAM_MLS = "MTL";
export const DEFAULT_SPORTS_TEAM_NBA = "TOR";

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

export const NFL_TEAM_OPTIONS: { value: string; label: string }[] = [
  { value: "ARI", label: "Arizona Cardinals" },
  { value: "ATL", label: "Atlanta Falcons" },
  { value: "BAL", label: "Baltimore Ravens" },
  { value: "BUF", label: "Buffalo Bills" },
  { value: "CAR", label: "Carolina Panthers" },
  { value: "CHI", label: "Chicago Bears" },
  { value: "CIN", label: "Cincinnati Bengals" },
  { value: "CLE", label: "Cleveland Browns" },
  { value: "DAL", label: "Dallas Cowboys" },
  { value: "DEN", label: "Denver Broncos" },
  { value: "DET", label: "Detroit Lions" },
  { value: "GB", label: "Green Bay Packers" },
  { value: "HOU", label: "Houston Texans" },
  { value: "IND", label: "Indianapolis Colts" },
  { value: "JAX", label: "Jacksonville Jaguars" },
  { value: "KC", label: "Kansas City Chiefs" },
  { value: "LV", label: "Las Vegas Raiders" },
  { value: "LAC", label: "Los Angeles Chargers" },
  { value: "LAR", label: "Los Angeles Rams" },
  { value: "MIA", label: "Miami Dolphins" },
  { value: "MIN", label: "Minnesota Vikings" },
  { value: "NE", label: "New England Patriots" },
  { value: "NO", label: "New Orleans Saints" },
  { value: "NYG", label: "New York Giants" },
  { value: "NYJ", label: "New York Jets" },
  { value: "PHI", label: "Philadelphia Eagles" },
  { value: "PIT", label: "Pittsburgh Steelers" },
  { value: "SF", label: "San Francisco 49ers" },
  { value: "SEA", label: "Seattle Seahawks" },
  { value: "TB", label: "Tampa Bay Buccaneers" },
  { value: "TEN", label: "Tennessee Titans" },
  { value: "WSH", label: "Washington Commanders" },
];

export const CFL_TEAM_OPTIONS: { value: string; label: string }[] = [
  { value: "BC", label: "BC Lions" },
  { value: "CGY", label: "Calgary Stampeders" },
  { value: "EDM", label: "Edmonton Elks" },
  { value: "HAM", label: "Hamilton Tiger-Cats" },
  { value: "MTL", label: "Montreal Alouettes" },
  { value: "OTT", label: "Ottawa Redblacks" },
  { value: "SSK", label: "Saskatchewan Roughriders" },
  { value: "TOR", label: "Toronto Argonauts" },
  { value: "WPG", label: "Winnipeg Blue Bombers" },
];

export const MLS_TEAM_OPTIONS: { value: string; label: string }[] = [
  { value: "ATL", label: "Atlanta United FC" },
  { value: "ATX", label: "Austin FC" },
  { value: "CLT", label: "Charlotte FC" },
  { value: "CHI", label: "Chicago Fire FC" },
  { value: "CIN", label: "FC Cincinnati" },
  { value: "COL", label: "Colorado Rapids" },
  { value: "CLB", label: "Columbus Crew" },
  { value: "DC", label: "D.C. United" },
  { value: "DAL", label: "FC Dallas" },
  { value: "HOU", label: "Houston Dynamo FC" },
  { value: "SKC", label: "Sporting Kansas City" },
  { value: "LA", label: "LA Galaxy" },
  { value: "LAFC", label: "Los Angeles FC" },
  { value: "MIA", label: "Inter Miami CF" },
  { value: "MIN", label: "Minnesota United FC" },
  { value: "MTL", label: "CF Montréal" },
  { value: "NSH", label: "Nashville SC" },
  { value: "NE", label: "New England Revolution" },
  { value: "NYC", label: "New York City FC" },
  { value: "NY", label: "New York Red Bulls" },
  { value: "ORL", label: "Orlando City SC" },
  { value: "PHI", label: "Philadelphia Union" },
  { value: "POR", label: "Portland Timbers" },
  { value: "RSL", label: "Real Salt Lake" },
  { value: "SD", label: "San Diego FC" },
  { value: "SJ", label: "San Jose Earthquakes" },
  { value: "SEA", label: "Seattle Sounders FC" },
  { value: "STL", label: "St. Louis City SC" },
  { value: "TOR", label: "Toronto FC" },
  { value: "VAN", label: "Vancouver Whitecaps FC" },
];

export const NBA_TEAM_OPTIONS: { value: string; label: string }[] = [
  { value: "ATL", label: "Atlanta Hawks" },
  { value: "BOS", label: "Boston Celtics" },
  { value: "BKN", label: "Brooklyn Nets" },
  { value: "CHA", label: "Charlotte Hornets" },
  { value: "CHI", label: "Chicago Bulls" },
  { value: "CLE", label: "Cleveland Cavaliers" },
  { value: "DAL", label: "Dallas Mavericks" },
  { value: "DEN", label: "Denver Nuggets" },
  { value: "DET", label: "Detroit Pistons" },
  { value: "GS", label: "Golden State Warriors" },
  { value: "HOU", label: "Houston Rockets" },
  { value: "IND", label: "Indiana Pacers" },
  { value: "LAC", label: "LA Clippers" },
  { value: "LAL", label: "Los Angeles Lakers" },
  { value: "MEM", label: "Memphis Grizzlies" },
  { value: "MIA", label: "Miami Heat" },
  { value: "MIL", label: "Milwaukee Bucks" },
  { value: "MIN", label: "Minnesota Timberwolves" },
  { value: "NO", label: "New Orleans Pelicans" },
  { value: "NY", label: "New York Knicks" },
  { value: "OKC", label: "Oklahoma City Thunder" },
  { value: "ORL", label: "Orlando Magic" },
  { value: "PHI", label: "Philadelphia 76ers" },
  { value: "PHX", label: "Phoenix Suns" },
  { value: "POR", label: "Portland Trail Blazers" },
  { value: "SAC", label: "Sacramento Kings" },
  { value: "SA", label: "San Antonio Spurs" },
  { value: "TOR", label: "Toronto Raptors" },
  { value: "UTAH", label: "Utah Jazz" },
  { value: "WSH", label: "Washington Wizards" },
];

export function effectiveSportsLeague(stored: string | null): SportsLeague {
  return SPORTS_LEAGUE_OPTIONS.some((o) => o.value === stored) ? (stored as SportsLeague) : DEFAULT_SPORTS_LEAGUE;
}

export function effectiveSportsTeamNhl(stored: string | null): string {
  return stored && NHL_TEAM_OPTIONS.some((o) => o.value === stored) ? stored : DEFAULT_SPORTS_TEAM_NHL;
}

export function effectiveSportsTeamMlb(stored: string | null): string {
  return stored && MLB_TEAM_OPTIONS.some((o) => o.value === stored) ? stored : DEFAULT_SPORTS_TEAM_MLB;
}

export function effectiveSportsTeamNfl(stored: string | null): string {
  return stored && NFL_TEAM_OPTIONS.some((o) => o.value === stored) ? stored : DEFAULT_SPORTS_TEAM_NFL;
}

export function effectiveSportsTeamCfl(stored: string | null): string {
  return stored && CFL_TEAM_OPTIONS.some((o) => o.value === stored) ? stored : DEFAULT_SPORTS_TEAM_CFL;
}

export function effectiveSportsTeamMls(stored: string | null): string {
  return stored && MLS_TEAM_OPTIONS.some((o) => o.value === stored) ? stored : DEFAULT_SPORTS_TEAM_MLS;
}

export function effectiveSportsTeamNba(stored: string | null): string {
  return stored && NBA_TEAM_OPTIONS.some((o) => o.value === stored) ? stored : DEFAULT_SPORTS_TEAM_NBA;
}

// The Dashboard header's Sports widget can show a different league on
// mobile than on desktop (e.g. NHL on desktop, MLB on mobile) — this
// resolves that pick, falling back to the desktop league when unset.
export function effectiveSportsLeagueMobile(stored: string | null, desktopLeague: SportsLeague): SportsLeague {
  return SPORTS_LEAGUE_OPTIONS.some((o) => o.value === stored) ? (stored as SportsLeague) : desktopLeague;
}

// Reads the signed-in user's own Sports picks fresh from the DB — same
// "session is only reissued at login" reasoning as getUserWorldClockZones.
export async function getUserSportsPicks(
  session: { user: { id: string } } | null,
  db: PrismaClient,
): Promise<{
  league: SportsLeague;
  teamNhl: string;
  teamMlb: string;
  teamNfl: string;
  teamCfl: string;
  teamMls: string;
  teamNba: string;
  leagueMobile: SportsLeague;
}> {
  if (!session) {
    return {
      league: DEFAULT_SPORTS_LEAGUE,
      teamNhl: DEFAULT_SPORTS_TEAM_NHL,
      teamMlb: DEFAULT_SPORTS_TEAM_MLB,
      teamNfl: DEFAULT_SPORTS_TEAM_NFL,
      teamCfl: DEFAULT_SPORTS_TEAM_CFL,
      teamMls: DEFAULT_SPORTS_TEAM_MLS,
      teamNba: DEFAULT_SPORTS_TEAM_NBA,
      leagueMobile: DEFAULT_SPORTS_LEAGUE,
    };
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      sportsLeague: true,
      sportsTeamNhl: true,
      sportsTeamMlb: true,
      sportsTeamNfl: true,
      sportsTeamCfl: true,
      sportsTeamMls: true,
      sportsTeamNba: true,
      sportsLeagueMobile: true,
    },
  });
  const league = effectiveSportsLeague(user?.sportsLeague ?? null);
  return {
    league,
    teamNhl: effectiveSportsTeamNhl(user?.sportsTeamNhl ?? null),
    teamMlb: effectiveSportsTeamMlb(user?.sportsTeamMlb ?? null),
    teamNfl: effectiveSportsTeamNfl(user?.sportsTeamNfl ?? null),
    teamCfl: effectiveSportsTeamCfl(user?.sportsTeamCfl ?? null),
    teamMls: effectiveSportsTeamMls(user?.sportsTeamMls ?? null),
    teamNba: effectiveSportsTeamNba(user?.sportsTeamNba ?? null),
    leagueMobile: effectiveSportsLeagueMobile(user?.sportsLeagueMobile ?? null, league),
  };
}
