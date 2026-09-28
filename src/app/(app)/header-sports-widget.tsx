"use client";

import { useEffect, useRef, useState } from "react";
import type { SportsTeamGame } from "@/lib/sports";
import type { Lang } from "@/lib/i18n/dictionaries";
import SportsCard, { type SportsCardSnapshot, type SportsLabels } from "./sports-card";

// Matches the Weather/News widgets' own placeholder pill size/shape — see
// header-weather-widget.tsx's WeatherWidgetSkeleton for why this exists.
export function SportsWidgetSkeleton() {
  return <div className="hidden h-9 w-24 animate-pulse rounded-lg bg-white/10 sm:block" />;
}

// Compact "latest game" pill for the Dashboard header — just the two team
// logos and the final score of the picked league/team's most recently
// played game (see src/lib/dashboard-sports-picks.ts for the league/team
// picker in Settings). Clicking it opens the complete Sports card
// (sports-card.tsx) as a drop-down, same pattern as Markets/News, so
// Last game / Next game (and the postseason series view for MLB) are
// still available even though the pill itself shows only one score.
export default function HeaderSportsWidget({
  game,
  teamLogo,
  teamName,
  gameDateLabel,
  cardSnapshot,
  hour12,
  lang,
  cardLabels,
  unavailableLabel,
}: {
  game: SportsTeamGame | null;
  teamLogo: string;
  teamName: string;
  gameDateLabel: string | null;
  cardSnapshot: SportsCardSnapshot | null;
  hour12: boolean;
  lang: Lang;
  cardLabels: SportsLabels;
  unavailableLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hasGame = Boolean(game && game.status === "final");
  const teamFirst = game?.homeAway === "home";
  const firstLogo = teamFirst ? teamLogo : game?.opponentLogo;
  const firstName = teamFirst ? teamName : game?.opponentName;
  const firstScore = teamFirst ? game?.teamScore : game?.opponentScore;
  const secondLogo = teamFirst ? game?.opponentLogo : teamLogo;
  const secondName = teamFirst ? game?.opponentName : teamName;
  const secondScore = teamFirst ? game?.opponentScore : game?.teamScore;

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          hasGame
            ? "flex flex-col items-center gap-0.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-amo-white transition-colors hover:bg-white/15"
            : "flex items-center rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-amo-white/70 transition-colors hover:bg-white/15"
        }
      >
        {hasGame ? (
          <>
            <div className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
              <img src={firstLogo} alt={firstName} className="h-5 w-5 object-contain" />
              <span className="font-display text-sm font-bold tabular-nums">{firstScore}</span>
              <span className="text-xs opacity-60">–</span>
              <span className="font-display text-sm font-bold tabular-nums">{secondScore}</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
              <img src={secondLogo} alt={secondName} className="h-5 w-5 object-contain" />
            </div>
            {gameDateLabel && (
              <span className="text-[9px] uppercase tracking-wide opacity-60">{gameDateLabel}</span>
            )}
          </>
        ) : (
          unavailableLabel
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] text-left">
          <SportsCard initial={cardSnapshot} hour12={hour12} lang={lang} labels={cardLabels} />
        </div>
      )}
    </div>
  );
}
