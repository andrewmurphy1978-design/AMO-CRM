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

const DEFAULT_NHL_TEAM_ABBREV = "MTL";

export const NHL_TEAM_NAMES: Record<string, string> = {
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
  MTL: "Montreal Canadiens",
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

function parseNhlGame(g: RawNhlGame, teamAbbrev: string): SportsTeamGame | null {
  const home = g.homeTeam;
  const away = g.awayTeam;
  if (!home?.abbrev || !away?.abbrev) return null;
  const homeAbbrev = home.abbrev;
  const awayAbbrev = away.abbrev;
  if (homeAbbrev !== teamAbbrev && awayAbbrev !== teamAbbrev) return null;
  const isHome = homeAbbrev === teamAbbrev;
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

export async function getNhlSnapshot(teamAbbrev: string = DEFAULT_NHL_TEAM_ABBREV): Promise<NhlSnapshot> {
  const errors: string[] = [];
  let lastGame: SportsTeamGame | null = null;
  let nextGame: SportsTeamGame | null = null;

  try {
    const res = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${teamAbbrev}/now`);
    if (!res.ok) {
      errors.push(`nhl: HTTP ${res.status}`);
    } else {
      const data = (await res.json()) as { games?: RawNhlGame[] };
      const games = Array.isArray(data.games) ? data.games : [];
      const parsed = games
        .map((g) => parseNhlGame(g, teamAbbrev))
        .filter((g): g is SportsTeamGame => g !== null);
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

  return {
    teamName: NHL_TEAM_NAMES[teamAbbrev] ?? teamAbbrev,
    teamLogo: nhlLogoUrl(teamAbbrev),
    lastGame,
    nextGame,
    errors,
  };
}

const DEFAULT_MLB_TEAM_ID = 141; // Toronto Blue Jays
const MLB_SPORT_ID = 1;

// MLB Stats API's own stable numeric team ids.
export const MLB_TEAM_NAMES: Record<number, string> = {
  109: "Arizona Diamondbacks",
  144: "Atlanta Braves",
  110: "Baltimore Orioles",
  111: "Boston Red Sox",
  112: "Chicago Cubs",
  145: "Chicago White Sox",
  113: "Cincinnati Reds",
  114: "Cleveland Guardians",
  115: "Colorado Rockies",
  116: "Detroit Tigers",
  117: "Houston Astros",
  118: "Kansas City Royals",
  108: "Los Angeles Angels",
  119: "Los Angeles Dodgers",
  146: "Miami Marlins",
  158: "Milwaukee Brewers",
  142: "Minnesota Twins",
  121: "New York Mets",
  147: "New York Yankees",
  133: "Oakland Athletics",
  143: "Philadelphia Phillies",
  134: "Pittsburgh Pirates",
  135: "San Diego Padres",
  137: "San Francisco Giants",
  136: "Seattle Mariners",
  138: "St. Louis Cardinals",
  139: "Tampa Bay Rays",
  140: "Texas Rangers",
  141: "Toronto Blue Jays",
  120: "Washington Nationals",
};

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

async function fetchMlbGames(teamId: number, gameType: string, season: number): Promise<RawMlbGame[]> {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=${MLB_SPORT_ID}&teamId=${teamId}&gameType=${gameType}&season=${season}`;
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

function toTeamGame(g: MlbSeriesGame, teamId: number): SportsTeamGame {
  const isHome = g.homeTeamId === teamId;
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

export async function getMlbSnapshot(teamId: number = DEFAULT_MLB_TEAM_ID): Promise<MlbSnapshot> {
  const errors: string[] = [];
  const season = new Date().getUTCFullYear();
  let inPostseason = false;
  let seriesGames: MlbSeriesGame[] = [];
  let lastGame: SportsTeamGame | null = null;
  let nextGame: SportsTeamGame | null = null;

  try {
    // "P" is the MLB Stats API's aggregate postseason gameType filter —
    // any games back means the team has clinched a postseason spot.
    const postGames = await fetchMlbGames(teamId, "P", season);
    const parsedPost = postGames.map(parseMlbGame).filter((g): g is MlbSeriesGame => g !== null);
    if (parsedPost.length > 0) {
      inPostseason = true;
      const sorted = [...parsedPost].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const now = Date.now();
      // The current/most recent series' opponent — last played game if
      // one exists, otherwise the earliest scheduled one.
      const reference = [...sorted].reverse().find((g) => new Date(g.date).getTime() <= now) ?? sorted[0];
      const opponentId = reference.homeTeamId === teamId ? reference.awayTeamId : reference.homeTeamId;
      seriesGames = sorted.filter((g) => g.homeTeamId === opponentId || g.awayTeamId === opponentId);
    }
  } catch (error) {
    errors.push(`mlb-postseason: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!inPostseason) {
    try {
      const regGames = await fetchMlbGames(teamId, "R", season);
      const parsed = regGames
        .map(parseMlbGame)
        .filter((g): g is MlbSeriesGame => g !== null)
        .map((g) => toTeamGame(g, teamId));
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
    teamName: MLB_TEAM_NAMES[teamId] ?? String(teamId),
    teamLogo: mlbLogoUrl(teamId),
    inPostseason,
    seriesGames,
    lastGame,
    nextGame,
    errors,
  };
}

// NFL/CFL/MLS/NBA all share the same last-game/next-game shape NHL already
// uses (no postseason-series special case like MLB) and all sit on ESPN's
// own public "site.api" — an undocumented but, like the NHL/MLB APIs above,
// widely relied-on endpoint (`site.api.espn.com/apis/site/v2/sports/
// {sport}/{league}/teams/{abbrev}/schedule`) rather than four more bespoke
// per-league clients. This session's network egress can't reach it either
// to confirm the live response shape, so parsing below is defensive in the
// same way as everything above it.
export type TeamSnapshot = NhlSnapshot;

interface RawEspnTeamRef {
  id?: string;
  abbreviation?: string;
  displayName?: string;
  logo?: string;
  // The team-schedule endpoint's competitors nest their logo as an array of
  // {href} objects (ESPN's general team-summary shape) rather than the flat
  // `logo` string above, which this repo's own code had assumed — kept as a
  // fallback below since either shape has been seen in ESPN's site.api.
  logos?: { href?: string }[];
}

interface RawEspnCompetitor {
  homeAway?: "home" | "away";
  score?: { value?: number; displayValue?: string } | string | number;
  team?: RawEspnTeamRef;
}

interface RawEspnCompetition {
  date?: string;
  competitors?: RawEspnCompetitor[];
  status?: { type?: { state?: string; completed?: boolean } };
}

interface RawEspnEvent {
  id?: string | number;
  date?: string;
  competitions?: RawEspnCompetition[];
}

interface RawEspnScheduleResponse {
  // The team-schedule endpoint's own top-level team summary — a much more
  // reliable way to identify "which competitor is us" in every event below
  // than trusting this file's own hardcoded abbreviation to exactly match
  // whatever format ESPN happens to use for a given league's competitors
  // (this is the likely reason NFL/CFL/MLS games weren't matching: a small
  // mismatch there makes parseEspnEvent's lookup fail for every event,
  // silently, with zero games parsed and no fetch error to show for it).
  team?: RawEspnTeamRef;
  events?: RawEspnEvent[];
}

function parseEspnScore(score: RawEspnCompetitor["score"]): number | null {
  if (typeof score === "number") return score;
  if (typeof score === "string") {
    const n = Number(score);
    return Number.isFinite(n) ? n : null;
  }
  if (score && typeof score === "object") {
    if (typeof score.value === "number") return score.value;
    if (typeof score.displayValue === "string") {
      const n = Number(score.displayValue);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function parseEspnEvent(
  event: RawEspnEvent,
  teamAbbrev: string,
  teamId: string | undefined,
  teamNames: Record<string, string>,
  fallbackLogo: (abbrev: string) => string,
): SportsTeamGame | null {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors;
  if (!competition || !competitors || competitors.length < 2) return null;
  // Match by the schedule response's own team id first (reliable regardless
  // of abbreviation formatting quirks per league) and only fall back to
  // abbreviation matching when the response didn't carry a top-level team id.
  const mine = competitors.find(
    (c) => (teamId && c.team?.id === teamId) || c.team?.abbreviation?.toUpperCase() === teamAbbrev.toUpperCase(),
  );
  const opponent = competitors.find((c) => c !== mine);
  const opponentAbbrev = opponent?.team?.abbreviation?.toUpperCase();
  if (!mine || !opponent) return null;

  const stateRaw = competition.status?.type?.state?.toLowerCase();
  const completed = competition.status?.type?.completed === true;
  const status: SportsTeamGame["status"] = completed ? "final" : stateRaw === "in" ? "live" : "upcoming";

  return {
    gameId: String(event.id ?? `${event.date}-${opponentAbbrev ?? opponent.team?.displayName}`),
    date: event.date ?? competition.date ?? new Date().toISOString(),
    opponentName: (opponentAbbrev && teamNames[opponentAbbrev]) ?? opponent.team?.displayName ?? opponentAbbrev ?? "?",
    opponentLogo: opponent.team?.logo ?? opponent.team?.logos?.[0]?.href ?? (opponentAbbrev ? fallbackLogo(opponentAbbrev) : ""),
    homeAway: mine.homeAway === "home" ? "home" : "away",
    status,
    teamScore: parseEspnScore(mine.score),
    opponentScore: parseEspnScore(opponent.score),
  };
}

async function getEspnTeamSnapshot(
  sportPath: string, // e.g. "football/nfl"
  teamAbbrev: string, // e.g. "NE" — also lowercased for the URL's own team slug
  teamNames: Record<string, string>,
  fallbackLogo: (abbrev: string) => string,
): Promise<TeamSnapshot> {
  const errors: string[] = [];
  let lastGame: SportsTeamGame | null = null;
  let nextGame: SportsTeamGame | null = null;
  // The guessed CDN path below (espnLogoUrl) only actually resolves for the
  // "major" leagues ESPN maintains that sprite folder for — NFL/NBA/NHL/MLB.
  // CFL and MLS/soccer logos live at different paths, so guessing 404s for
  // them; the schedule response's own team.logo/logos[] is the real one and
  // always preferred when present, with the guess only as a last resort.
  let teamLogo: string | null = null;

  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${teamAbbrev.toLowerCase()}/schedule`,
    );
    if (!res.ok) {
      errors.push(`espn(${sportPath}): HTTP ${res.status}`);
    } else {
      const data = (await res.json()) as RawEspnScheduleResponse;
      const events = Array.isArray(data.events) ? data.events : [];
      const resolvedTeamId = data.team?.id;
      teamLogo = data.team?.logo ?? data.team?.logos?.[0]?.href ?? null;
      const parsed = events
        .map((e) => parseEspnEvent(e, teamAbbrev, resolvedTeamId, teamNames, fallbackLogo))
        .filter((g): g is SportsTeamGame => g !== null);
      if (events.length > 0 && parsed.length === 0) {
        // ESPN returned a real schedule but nothing in it matched our team —
        // almost certainly an abbreviation/id mismatch in parseEspnEvent
        // rather than "no games", so this is worth surfacing instead of
        // quietly looking identical to an empty season.
        errors.push(`espn(${sportPath}): received ${events.length} events but none matched team "${teamAbbrev}"`);
      }
      const now = Date.now();
      const past = parsed.filter((g) => g.status === "final" && new Date(g.date).getTime() <= now);
      const future = parsed
        .filter((g) => g.status !== "final" && new Date(g.date).getTime() >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      lastGame = past.length > 0 ? past[past.length - 1] : null;
      nextGame = future.length > 0 ? future[0] : null;
    }
  } catch (error) {
    errors.push(`espn(${sportPath}): ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    teamName: teamNames[teamAbbrev] ?? teamAbbrev,
    teamLogo: teamLogo ?? fallbackLogo(teamAbbrev),
    lastGame,
    nextGame,
    errors,
  };
}

// ESPN's own team-logo CDN follows this pattern for every sport it covers —
// used only as a fallback since the schedule response above usually already
// embeds each competitor's own `team.logo` URL directly.
function espnLogoUrl(spritePath: string, abbrev: string): string {
  return `https://a.espncdn.com/i/teamlogos/${spritePath}/500/${abbrev.toLowerCase()}.png`;
}

const DEFAULT_NFL_TEAM = "NE"; // New England Patriots — closest NFL market to Quebec

export const NFL_TEAM_NAMES: Record<string, string> = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LV: "Las Vegas Raiders",
  LAC: "Los Angeles Chargers",
  LAR: "Los Angeles Rams",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SF: "San Francisco 49ers",
  SEA: "Seattle Seahawks",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WSH: "Washington Commanders",
};

export async function getNflSnapshot(teamAbbrev: string = DEFAULT_NFL_TEAM): Promise<TeamSnapshot> {
  return getEspnTeamSnapshot("football/nfl", teamAbbrev, NFL_TEAM_NAMES, (a) => espnLogoUrl("nfl", a));
}

const DEFAULT_CFL_TEAM = "MTL"; // Montreal Alouettes

export const CFL_TEAM_NAMES: Record<string, string> = {
  BC: "BC Lions",
  CGY: "Calgary Stampeders",
  EDM: "Edmonton Elks",
  HAM: "Hamilton Tiger-Cats",
  MTL: "Montreal Alouettes",
  OTT: "Ottawa Redblacks",
  SSK: "Saskatchewan Roughriders",
  TOR: "Toronto Argonauts",
  WPG: "Winnipeg Blue Bombers",
};

export async function getCflSnapshot(teamAbbrev: string = DEFAULT_CFL_TEAM): Promise<TeamSnapshot> {
  return getEspnTeamSnapshot("football/cfl", teamAbbrev, CFL_TEAM_NAMES, (a) => espnLogoUrl("cfl", a));
}

const DEFAULT_MLS_TEAM = "MTL"; // CF Montréal

export const MLS_TEAM_NAMES: Record<string, string> = {
  ATL: "Atlanta United FC",
  ATX: "Austin FC",
  CLT: "Charlotte FC",
  CHI: "Chicago Fire FC",
  CIN: "FC Cincinnati",
  COL: "Colorado Rapids",
  CLB: "Columbus Crew",
  DC: "D.C. United",
  DAL: "FC Dallas",
  HOU: "Houston Dynamo FC",
  SKC: "Sporting Kansas City",
  LA: "LA Galaxy",
  LAFC: "Los Angeles FC",
  MIA: "Inter Miami CF",
  MIN: "Minnesota United FC",
  MTL: "CF Montréal",
  NSH: "Nashville SC",
  NE: "New England Revolution",
  NYC: "New York City FC",
  NY: "New York Red Bulls",
  ORL: "Orlando City SC",
  PHI: "Philadelphia Union",
  POR: "Portland Timbers",
  RSL: "Real Salt Lake",
  SD: "San Diego FC",
  SJ: "San Jose Earthquakes",
  SEA: "Seattle Sounders FC",
  STL: "St. Louis City SC",
  TOR: "Toronto FC",
  VAN: "Vancouver Whitecaps FC",
};

export async function getMlsSnapshot(teamAbbrev: string = DEFAULT_MLS_TEAM): Promise<TeamSnapshot> {
  return getEspnTeamSnapshot("soccer/usa.1", teamAbbrev, MLS_TEAM_NAMES, (a) => espnLogoUrl("soccer", a));
}

const DEFAULT_NBA_TEAM = "TOR"; // Toronto Raptors — only Canadian NBA team

export const NBA_TEAM_NAMES: Record<string, string> = {
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GS: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NO: "New Orleans Pelicans",
  NY: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SA: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTAH: "Utah Jazz",
  WSH: "Washington Wizards",
};

export async function getNbaSnapshot(teamAbbrev: string = DEFAULT_NBA_TEAM): Promise<TeamSnapshot> {
  return getEspnTeamSnapshot("basketball/nba", teamAbbrev, NBA_TEAM_NAMES, (a) => espnLogoUrl("nba", a));
}
