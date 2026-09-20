// Free, no-key sports data — the NHL and MLB stats APIs used here are the
// same public (undocumented but widely relied-on) endpoints many sports
// sites/apps build on. Like markets.ts, every fetch here is defensive
// (empty/null on failure, never a thrown error) and records what went
// wrong in `errors` — this session's network egress can't reach either
// host to confirm live response shapes, so field access below is guarded
// and falls back gracefully rather than crashing the dashboard if a field
// is missing or renamed.
export interface SportsTeamGame {
  gameId: string;
  date: string; // ISO
  opponentName: string;
  opponentLogo: string;
  homeAway: "home" | "away";
  status: "final" | "live" | "upcoming";
  teamScore: number | null;
  opponentScore: number | null;
}

export interface NhlSnapshot {
  teamName: string;
  teamLogo: string;
  lastGame: SportsTeamGame | null;
  nextGame: SportsTeamGame | null;
  errors: string[];
}

export interface MlbSeriesGame {
  gameId: string;
  date: string;
  status: "final" | "live" | "upcoming";
  homeTeamId: number;
  homeTeamName: string;
  homeTeamLogo: string;
  homeScore: number | null;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamLogo: string;
  awayScore: number | null;
}

export interface MlbSnapshot {
  teamName: string;
  teamLogo: string;
  inPostseason: boolean;
  // Populated when inPostseason: every game (played + scheduled) in the
  // Blue Jays' current series.
  seriesGames: MlbSeriesGame[];
  // Populated otherwise: simple last-result / next-game view.
  lastGame: SportsTeamGame | null;
  nextGame: SportsTeamGame | null;
  errors: string[];
}

export interface SportsSnapshot {
  nhl: NhlSnapshot;
  mlb: MlbSnapshot;
  fetchedAt: string;
}

const NHL_TEAM_ABBREV = "MTL";
const NHL_TEAM_NAME = "Montreal Canadiens";

const NHL_TEAM_NAMES: Record<string, string> = {
  ANA: "Anaheim Ducks",
  ARI: "Arizona Coyotes",
  BOS: "Boston Bruins",
  BUF: "Buffalo Sabres",
  CGY: "Calgary Flames",
  CAR: "Carolina Hurricanes",
  CHI: "Chicago Blackhawks",
  COL: "Colorado Avalanche",
  CBJ: "Columbus Blue Jackets",
  DAL: "Dallas Stars",
  DET: "Detroit Red Wings",
  EDM: "Edmonton Oilers",
  FLA: "Florida Panthers",
  LAK: "Los Angeles Kings",
  MIN: "Minnesota Wild",
  MTL: NHL_TEAM_NAME,
  NSH: "Nashville Predators",
  NJD: "New Jersey Devils",
  NYI: "New York Islanders",
  NYR: "New York Rangers",
  OTT: "Ottawa Senators",
  PHI: "Philadelphia Flyers",
  PIT: "Pittsburgh Penguins",
  SEA: "Seattle Kraken",
  SJS: "San Jose Sharks",
  STL: "St. Louis Blues",
  TBL: "Tampa Bay Lightning",
  TOR: "Toronto Maple Leafs",
  UTA: "Utah Hockey Club",
  VAN: "Vancouver Canucks",
  VGK: "Vegas Golden Knights",
  WSH: "Washington Capitals",
  WPG: "Winnipeg Jets",
};

function nhlLogoUrl(abbrev: string): string {
  return `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`;
}

interface RawNhlTeam {
  abbrev?: string;
  score?: number;
  logo?: string;
}

interface RawNhlGame {
  id?: number;
  startTimeUTC?: string;
  gameDate?: string;
  gameState?: string;
  homeTeam?: RawNhlTeam;
  awayTeam?: RawNhlTeam;
}

function parseNhlGame(g: RawNhlGame): SportsTeamGame | null {
  const home = g.homeTeam;
  const away = g.awayTeam;
  if (!home?.abbrev || !away?.abbrev) return null;
  const homeAbbrev = home.abbrev;
  const awayAbbrev = away.abbrev;
  if (homeAbbrev !== NHL_TEAM_ABBREV && awayAbbrev !== NHL_TEAM_ABBREV) return null;
  const isHome = homeAbbrev === NHL_TEAM_ABBREV;
  const team = isHome ? home : away;
  const opponent = isHome ? away : home;
  const opponentAbbrev = isHome ? awayAbbrev : homeAbbrev;

  const stateRaw = String(g.gameState ?? "").toUpperCase();
  const status: SportsTeamGame["status"] =
    stateRaw === "OFF" || stateRaw === "FINAL"
      ? "final"
      : stateRaw === "LIVE" || stateRaw === "CRIT"
        ? "live"
        : "upcoming";

  return {
    gameId: String(g.id ?? `${g.startTimeUTC ?? g.gameDate}-${opponentAbbrev}`),
    date: g.startTimeUTC ?? g.gameDate ?? new Date().toISOString(),
    opponentName: NHL_TEAM_NAMES[opponentAbbrev] ?? opponentAbbrev,
    opponentLogo: opponent.logo ?? nhlLogoUrl(opponentAbbrev),
    homeAway: isHome ? "home" : "away",
    status,
    teamScore: typeof team.score === "number" ? team.score : null,
    opponentScore: typeof opponent.score === "number" ? opponent.score : null,
  };
}

export async function getNhlSnapshot(): Promise<NhlSnapshot> {
  const errors: string[] = [];
  let lastGame: SportsTeamGame | null = null;
  let nextGame: SportsTeamGame | null = null;

  try {
    const res = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${NHL_TEAM_ABBREV}/now`);
    if (!res.ok) {
      errors.push(`nhl: HTTP ${res.status}`);
    } else {
      const data = (await res.json()) as { games?: RawNhlGame[] };
      const games = Array.isArray(data.games) ? data.games : [];
      const parsed = games.map(parseNhlGame).filter((g): g is SportsTeamGame => g !== null);
      const now = Date.now();
      const past = parsed.filter((g) => g.status === "final" && new Date(g.date).getTime() <= now);
      const future = parsed
        .filter((g) => g.status !== "final" && new Date(g.date).getTime() >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      lastGame = past.length > 0 ? past[past.length - 1] : null;
      nextGame = future.length > 0 ? future[0] : null;
    }
  } catch (error) {
    errors.push(`nhl: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { teamName: NHL_TEAM_NAME, teamLogo: nhlLogoUrl(NHL_TEAM_ABBREV), lastGame, nextGame, errors };
}

const MLB_TEAM_ID = 141; // Toronto Blue Jays
const MLB_TEAM_NAME = "Toronto Blue Jays";
const MLB_SPORT_ID = 1;

function mlbLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}

interface RawMlbTeamSide {
  score?: number;
  team?: { id?: number; name?: string };
}

interface RawMlbGame {
  gamePk?: number;
  gameDate?: string;
  status?: { abstractGameState?: string };
  teams?: { home?: RawMlbTeamSide; away?: RawMlbTeamSide };
}

async function fetchMlbGames(gameType: string, season: number): Promise<RawMlbGame[]> {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=${MLB_SPORT_ID}&teamId=${MLB_TEAM_ID}&gameType=${gameType}&season=${season}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { dates?: { games?: RawMlbGame[] }[] };
  const dates = Array.isArray(data.dates) ? data.dates : [];
  return dates.flatMap((d) => (Array.isArray(d.games) ? d.games : []));
}

function parseMlbGame(g: RawMlbGame): MlbSeriesGame | null {
  const home = g.teams?.home;
  const away = g.teams?.away;
  if (!home?.team?.id || !home.team.name || !away?.team?.id || !away.team.name) return null;

  const stateRaw = String(g.status?.abstractGameState ?? "").toLowerCase();
  const status: MlbSeriesGame["status"] = stateRaw === "final" ? "final" : stateRaw === "live" ? "live" : "upcoming";

  return {
    gameId: String(g.gamePk ?? `${g.gameDate}-${away.team.id}-${home.team.id}`),
    date: g.gameDate ?? new Date().toISOString(),
    status,
    homeTeamId: home.team.id,
    homeTeamName: home.team.name,
    homeTeamLogo: mlbLogoUrl(home.team.id),
    homeScore: typeof home.score === "number" ? home.score : null,
    awayTeamId: away.team.id,
    awayTeamName: away.team.name,
    awayTeamLogo: mlbLogoUrl(away.team.id),
    awayScore: typeof away.score === "number" ? away.score : null,
  };
}

function toTeamGame(g: MlbSeriesGame): SportsTeamGame {
  const isHome = g.homeTeamId === MLB_TEAM_ID;
  return {
    gameId: g.gameId,
    date: g.date,
    opponentName: isHome ? g.awayTeamName : g.homeTeamName,
    opponentLogo: isHome ? g.awayTeamLogo : g.homeTeamLogo,
    homeAway: isHome ? "home" : "away",
    status: g.status,
    teamScore: isHome ? g.homeScore : g.awayScore,
    opponentScore: isHome ? g.awayScore : g.homeScore,
  };
}

export async function getMlbSnapshot(): Promise<MlbSnapshot> {
  const errors: string[] = [];
  const season = new Date().getUTCFullYear();
  let inPostseason = false;
  let seriesGames: MlbSeriesGame[] = [];
  let lastGame: SportsTeamGame | null = null;
  let nextGame: SportsTeamGame | null = null;

  try {
    // "P" is the MLB Stats API's aggregate postseason gameType filter —
    // any games back means the Blue Jays have clinched a postseason spot.
    const postGames = await fetchMlbGames("P", season);
    const parsedPost = postGames.map(parseMlbGame).filter((g): g is MlbSeriesGame => g !== null);
    if (parsedPost.length > 0) {
      inPostseason = true;
      const sorted = [...parsedPost].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const now = Date.now();
      // The current/most recent series' opponent — last played game if
      // one exists, otherwise the earliest scheduled one.
      const reference = [...sorted].reverse().find((g) => new Date(g.date).getTime() <= now) ?? sorted[0];
      const opponentId = reference.homeTeamId === MLB_TEAM_ID ? reference.awayTeamId : reference.homeTeamId;
      seriesGames = sorted.filter((g) => g.homeTeamId === opponentId || g.awayTeamId === opponentId);
    }
  } catch (error) {
    errors.push(`mlb-postseason: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!inPostseason) {
    try {
      const regGames = await fetchMlbGames("R", season);
      const parsed = regGames.map(parseMlbGame).filter((g): g is MlbSeriesGame => g !== null).map(toTeamGame);
      const now = Date.now();
      const past = parsed.filter((g) => g.status === "final" && new Date(g.date).getTime() <= now);
      const future = parsed
        .filter((g) => g.status !== "final" && new Date(g.date).getTime() >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      lastGame = past.length > 0 ? past[past.length - 1] : null;
      nextGame = future.length > 0 ? future[0] : null;
    } catch (error) {
      errors.push(`mlb-regular: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    teamName: MLB_TEAM_NAME,
    teamLogo: mlbLogoUrl(MLB_TEAM_ID),
    inPostseason,
    seriesGames,
    lastGame,
    nextGame,
    errors,
  };
}

export async function getSportsSnapshot(): Promise<SportsSnapshot> {
  const [nhl, mlb] = await Promise.all([getNhlSnapshot(), getMlbSnapshot()]);
  return { nhl, mlb, fetchedAt: new Date().toISOString() };
}
