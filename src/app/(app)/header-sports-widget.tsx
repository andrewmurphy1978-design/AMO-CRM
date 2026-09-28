import type { SportsTeamGame } from "@/lib/sports";

// Matches the Weather/News widgets' own placeholder pill size/shape — see
// header-weather-widget.tsx's WeatherWidgetSkeleton for why this exists.
export function SportsWidgetSkeleton() {
  return <div className="hidden h-9 w-24 animate-pulse rounded-lg bg-white/10 sm:block" />;
}

// Compact "latest game" pill for the Dashboard header — just the two team
// logos and the final score of the picked league/team's most recently
// played game (see src/lib/dashboard-sports-picks.ts for the league/team
// picker in Settings). No drop-down or refresh: unlike Weather/News/
// Markets there's nothing more to show once the score is on screen, so
// this stays a plain, non-interactive server-rendered pill.
export default function HeaderSportsWidget({
  game,
  teamLogo,
  teamName,
  unavailableLabel,
}: {
  game: SportsTeamGame | null;
  teamLogo: string;
  teamName: string;
  unavailableLabel: string;
}) {
  if (!game || game.status !== "final") {
    return (
      <div className="hidden items-center rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-amo-white/70 sm:flex">
        {unavailableLabel}
      </div>
    );
  }

  const teamFirst = game.homeAway === "home";
  const firstLogo = teamFirst ? teamLogo : game.opponentLogo;
  const firstName = teamFirst ? teamName : game.opponentName;
  const firstScore = teamFirst ? game.teamScore : game.opponentScore;
  const secondLogo = teamFirst ? game.opponentLogo : teamLogo;
  const secondName = teamFirst ? game.opponentName : teamName;
  const secondScore = teamFirst ? game.opponentScore : game.teamScore;

  return (
    <div className="hidden items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-amo-white sm:flex">
      {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
      <img src={firstLogo} alt={firstName} className="h-5 w-5 object-contain" />
      <span className="font-display text-sm font-bold tabular-nums">{firstScore}</span>
      <span className="text-xs opacity-60">–</span>
      <span className="font-display text-sm font-bold tabular-nums">{secondScore}</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
      <img src={secondLogo} alt={secondName} className="h-5 w-5 object-contain" />
    </div>
  );
}
