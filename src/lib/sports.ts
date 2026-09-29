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

export type TeamSnapshot = NhlSnapshot;

// NFL/CFL/MLS/NBA used to sit on ESPN's undocumented "site.api" — which
// returns a flat HTTP 403 to every request from this Worker (confirmed live
// via the widget's own surfaced error; a browser-shaped User-Agent didn't
// fix it either, pointing at an IP/ASN-level block rather than a header
// check). Switched to TheSportsDB (thesportsdb.com), the only free sports
// API found that covers all four of these leagues — including CFL, which
// almost nothing else does — in one consistent shape. "123" is TheSportsDB's
// own current official free test key (an older "3" key still works but is
// undocumented and more restricted) — used as the default; set
// THESPORTSDB_KEY (a $1/mo Patreon personal key removes the shared-key
// rate-limit risk) to override it.
const THESPORTSDB_KEY = process.env.THESPORTSDB_KEY || "123";

interface RawTsdbTeam {
  idTeam?: string;
  strTeam?: string;
  strTeamBadge?: string;
  strLeague?: string;
}

interface RawTsdbEvent {
  idEvent?: string;
  dateEvent?: string; // "YYYY-MM-DD"
  strTime?: string; // "HH:MM:SS", UTC
  strTimestamp?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
}

function tsdbUrl(path: string): string {
  return `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_KEY}/${path}`;
}

// The free key is shared globally across every developer using TheSportsDB's
// free tier, not just this app — a burst of other people's traffic is enough
// to trip its rate limit and hand back HTTP 429 on an otherwise-fine
// request. A couple of short retries rides out that kind of transient
// contention; it does nothing for sustained rate-limiting (that needs a
// personal, non-shared key), but the widget's own Suspense boundary already
// keeps this off the Dashboard's critical path, so the extra latency here
// costs nothing else on the page.
async function fetchTsdb(url: string): Promise<Response> {
  const delaysMs = [300, 900];
  let res = await fetch(url);
  for (const delay of delaysMs) {
    if (res.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    res = await fetch(url);
  }
  return res;
}

// TheSportsDB has no per-league "get team by abbreviation" lookup — its own
// team ids are looked up by full name via search, then reused for the
// events calls below. leagueHint is only a best-effort disambiguator (this
// session can't confirm TheSportsDB's exact strLeague label strings live);
// an exact team-name match or the first result are both safe fallbacks
// since every team name here (e.g. "Montreal Alouettes") is specific enough
// that cross-sport collisions are unlikely.
async function findTsdbTeam(teamName: string, leagueHint: string): Promise<{ id: string; badge: string | null } | null> {
  const res = await fetchTsdb(tsdbUrl(`searchteams.php?t=${encodeURIComponent(teamName)}`));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { teams?: RawTsdbTeam[] | null };
  const teams = Array.isArray(data.teams) ? data.teams : [];
  const match =
    teams.find((t) => t.strLeague === leagueHint) ??
    teams.find((t) => t.strTeam?.toLowerCase() === teamName.toLowerCase()) ??
    teams[0];
  if (!match?.idTeam) return null;
  return { id: match.idTeam, badge: match.strTeamBadge ?? null };
}

// eventslast.php returns only past/completed games and eventsnext.php only
// future/scheduled ones — that split is exactly "last game"/"next game", so
// unlike the NHL/MLB/former-ESPN code above there's no need to fetch a whole
// season and filter it by the current time client-side.
async function fetchTsdbEvents(endpoint: "eventslast" | "eventsnext", teamId: string): Promise<RawTsdbEvent[]> {
  const res = await fetchTsdb(tsdbUrl(`${endpoint}.php?id=${teamId}`));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { results?: RawTsdbEvent[] | null; events?: RawTsdbEvent[] | null };
  const events = data.results ?? data.events ?? [];
  return Array.isArray(events) ? events : [];
}

async function lookupTsdbBadge(teamId: string): Promise<string | null> {
  try {
    const res = await fetchTsdb(tsdbUrl(`lookupteam.php?id=${teamId}`));
    if (!res.ok) return null;
    const data = (await res.json()) as { teams?: RawTsdbTeam[] | null };
    return data.teams?.[0]?.strTeamBadge ?? null;
  } catch {
    return null;
  }
}

function tsdbScore(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// TheSportsDB's own strTeamBadge came back empty for every NFL/CFL/MLS/NBA
// team live (confirmed by the user — scores and names work, logos never
// show), so logos for these leagues come from elsewhere:
//
// - NFL/NBA: ESPN's static logo CDN — a different host from the JSON API
//   that 403s this Worker, unauthenticated, with a confirmed-reliable
//   espncdn.com/i/teamlogos/{sport}/500/{abbrev}.png path for these two
//   leagues specifically.
// - CFL/MLS: MLS's ESPN CDN entries use numeric ids instead of team
//   abbreviations (a mapping this file doesn't have), and CFL's own ESPN
//   path is unconfirmed — guessing either risked repeating the exact
//   "wrong CDN path, silently 404s" mistake already hit once this session.
//   Wikipedia's page-summary API needs no per-team id mapping at all: its
//   lead image for a sports-franchise article is, by long-standing
//   Wikipedia infobox convention, the team's own crest/logo — and it can
//   be queried directly with the exact same full team-name strings this
//   file already keys everything by.
function espnLogoUrl(spritePath: string, abbrev: string): string {
  return `https://a.espncdn.com/i/teamlogos/${spritePath}/500/${abbrev.toLowerCase()}.png`;
}

// Wikipedia's API etiquette policy asks every caller to identify itself
// with a descriptive User-Agent (unlike ESPN's block, this is a documented,
// compliance-friendly requirement, not an anti-bot measure) —
// https://meta.wikimedia.org/wiki/User-Agent_policy.
async function fetchWikipediaLogo(title: string): Promise<string | null> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AMO-CRM/1.0 (https://crm.andrewmurphy.online)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { thumbnail?: { source?: string }; originalimage?: { source?: string } };
    return data.thumbnail?.source ?? data.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

function reverseNameMap(names: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(names).map(([abbrev, name]) => [name, abbrev]));
}

interface LogoOptions {
  espn?: {
    sportPath: string;
    // TheSportsDB's opponent name strings won't always exactly match this
    // file's own team-name strings (punctuation, "LA" vs "Los Angeles", …)
    // — a miss here just falls back to no logo for that one opponent
    // rather than breaking anything.
    nameToAbbrev: Record<string, string>;
  };
  wikipedia?: boolean;
}

async function resolveOpponentLogo(opponentName: string, opponentId: string | undefined, logos: LogoOptions | undefined): Promise<string> {
  const espnAbbrev = logos?.espn?.nameToAbbrev[opponentName];
  if (espnAbbrev) return espnLogoUrl(logos!.espn!.sportPath, espnAbbrev);
  if (logos?.wikipedia) {
    const wiki = await fetchWikipediaLogo(opponentName);
    if (wiki) return wiki;
  }
  return opponentId ? ((await lookupTsdbBadge(opponentId)) ?? "") : "";
}

async function toTsdbTeamGame(
  e: RawTsdbEvent,
  myTeamId: string,
  status: SportsTeamGame["status"],
  logos: LogoOptions | undefined,
): Promise<SportsTeamGame | null> {
  const isHome = e.idHomeTeam === myTeamId;
  const isAway = e.idAwayTeam === myTeamId;
  if (!isHome && !isAway) return null;
  const opponentId = isHome ? e.idAwayTeam : e.idHomeTeam;
  const opponentName = (isHome ? e.strAwayTeam : e.strHomeTeam) ?? "?";
  const date = e.strTimestamp
    ? new Date(e.strTimestamp).toISOString()
    : new Date(`${e.dateEvent ?? ""}T${e.strTime || "00:00:00"}Z`).toISOString();

  return {
    gameId: String(e.idEvent ?? `${e.dateEvent}-${opponentName}`),
    date,
    opponentName,
    opponentLogo: await resolveOpponentLogo(opponentName, opponentId, logos),
    homeAway: isHome ? "home" : "away",
    status,
    teamScore: tsdbScore(isHome ? e.intHomeScore : e.intAwayScore),
    opponentScore: tsdbScore(isHome ? e.intAwayScore : e.intHomeScore),
  };
}

async function getTheSportsDbSnapshot(
  teamAbbrev: string,
  teamNames: Record<string, string>,
  leagueHint: string,
  logos?: LogoOptions,
): Promise<TeamSnapshot> {
  const errors: string[] = [];
  const teamName = teamNames[teamAbbrev] ?? teamAbbrev;
  let lastGame: SportsTeamGame | null = null;
  let nextGame: SportsTeamGame | null = null;
  let teamLogo: string | null = logos?.espn ? espnLogoUrl(logos.espn.sportPath, teamAbbrev) : logos?.wikipedia ? await fetchWikipediaLogo(teamName) : null;

  try {
    const found = await findTsdbTeam(teamName, leagueHint);
    if (!found) {
      errors.push(`thesportsdb(${leagueHint}): could not find team "${teamName}"`);
    } else {
      teamLogo = teamLogo ?? found.badge;
      const [lastEvents, nextEvents] = await Promise.all([
        fetchTsdbEvents("eventslast", found.id).catch((error: unknown) => {
          errors.push(`thesportsdb(${leagueHint}) eventslast: ${error instanceof Error ? error.message : String(error)}`);
          return [] as RawTsdbEvent[];
        }),
        fetchTsdbEvents("eventsnext", found.id).catch((error: unknown) => {
          errors.push(`thesportsdb(${leagueHint}) eventsnext: ${error instanceof Error ? error.message : String(error)}`);
          return [] as RawTsdbEvent[];
        }),
      ]);
      const lastRaw = lastEvents[lastEvents.length - 1];
      const nextRaw = nextEvents[0];
      if (lastRaw) lastGame = await toTsdbTeamGame(lastRaw, found.id, "final", logos);
      if (nextRaw) nextGame = await toTsdbTeamGame(nextRaw, found.id, "upcoming", logos);
    }
  } catch (error) {
    errors.push(`thesportsdb(${leagueHint}): ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    teamName,
    teamLogo: teamLogo ?? "",
    lastGame,
    nextGame,
    errors,
  };
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

const NFL_NAME_TO_ABBREV = reverseNameMap(NFL_TEAM_NAMES);

export async function getNflSnapshot(teamAbbrev: string = DEFAULT_NFL_TEAM): Promise<TeamSnapshot> {
  return getTheSportsDbSnapshot(teamAbbrev, NFL_TEAM_NAMES, "NFL", { espn: { sportPath: "nfl", nameToAbbrev: NFL_NAME_TO_ABBREV } });
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
  return getTheSportsDbSnapshot(teamAbbrev, CFL_TEAM_NAMES, "CFL", { wikipedia: true });
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
  return getTheSportsDbSnapshot(teamAbbrev, MLS_TEAM_NAMES, "American Major League Soccer", { wikipedia: true });
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

const NBA_NAME_TO_ABBREV = reverseNameMap(NBA_TEAM_NAMES);

export async function getNbaSnapshot(teamAbbrev: string = DEFAULT_NBA_TEAM): Promise<TeamSnapshot> {
  return getTheSportsDbSnapshot(teamAbbrev, NBA_TEAM_NAMES, "NBA", { espn: { sportPath: "nba", nameToAbbrev: NBA_NAME_TO_ABBREV } });
}
