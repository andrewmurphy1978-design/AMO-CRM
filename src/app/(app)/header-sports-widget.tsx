"use client";

import { useEffect, useRef, useState } from "react";
import type { SportsTeamGame } from "@/lib/sports";
import type { Lang } from "@/lib/i18n/dictionaries";
import SportsCard, { type SportsCardSnapshot, type SportsLabels } from "./sports-card";

// Matches the Weather/News widgets' own placeholder pill size/shape — see
// header-weather-widget.tsx's WeatherWidgetSkeleton for why this exists.
export function SportsWidgetSkeleton() {
  return <div className="h-9 w-24 animate-pulse rounded-lg bg-white/10" />;
}

export interface SportsHeaderPick {
  game: SportsTeamGame | null;
  teamLogo: string;
  teamName: string;
  gameDateLabel: string | null;
}

function Pill({
  pick,
  unavailableLabel,
  compact,
  open,
  onToggle,
}: {
  pick: SportsHeaderPick;
  unavailableLabel: string;
  compact: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { game, teamLogo, teamName, gameDateLabel } = pick;
  const hasGame = Boolean(game && game.status === "final");
  const teamFirst = game?.homeAway === "home";
  const firstLogo = teamFirst ? teamLogo : game?.opponentLogo;
  const firstName = teamFirst ? teamName : game?.opponentName;
  const firstScore = teamFirst ? game?.teamScore : game?.opponentScore;
  const secondLogo = teamFirst ? game?.opponentLogo : teamLogo;
  const secondName = teamFirst ? game?.opponentName : teamName;
  const secondScore = teamFirst ? game?.opponentScore : game?.teamScore;
  const logoSize = compact ? "h-4 w-4" : "h-5 w-5";
  const scoreText = compact ? "text-xs" : "text-sm";
  const gap = compact ? "gap-1" : "gap-1.5";
  const padding = compact ? "px-1.5 py-0.5" : "px-2.5 py-1.5";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={
        hasGame
          ? `flex flex-col items-center gap-0 rounded-lg bg-white/10 ${padding} text-amo-white transition-colors hover:bg-white/15`
          : `flex items-center rounded-lg bg-white/10 ${padding} text-[10px] text-amo-white/70 transition-colors hover:bg-white/15`
      }
    >
      {hasGame ? (
        <>
          <div className={`flex items-center ${gap}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
            <img src={firstLogo} alt={firstName} className={`${logoSize} object-contain`} />
            <span className={`font-display ${scoreText} font-bold tabular-nums`}>{firstScore}</span>
            <span className="text-xs opacity-60">–</span>
            <span className={`font-display ${scoreText} font-bold tabular-nums`}>{secondScore}</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- external team-logo CDN, not a local asset */}
            <img src={secondLogo} alt={secondName} className={`${logoSize} object-contain`} />
          </div>
          {!compact && gameDateLabel && (
            <span className="text-[9px] uppercase tracking-wide opacity-60">{gameDateLabel}</span>
          )}
        </>
      ) : (
        <span className={compact ? "block max-w-[8rem] truncate" : ""}>{unavailableLabel}</span>
      )}
    </button>
  );
}

// Centers the drop-down panel on the viewport on mobile (a trigger this
// small, wherever it lands in the wrapped header, can't anchor a wide
// panel without it running off-screen) while keeping it anchored to the
// trigger like before at sm+ — see the identical comment on the other
// header widgets' panels.
// sm:w-80 (320px) was too narrow for the Last/Next Game columns (each a
// sm:grid-cols-2 half of the panel) to show a full opponent name like
// "New England Patriots" or "Winnipeg Blue Bombers" without truncating —
// widened to 30rem. sm:max-h-none used to remove the mobile cap entirely on
// desktop, which let the panel grow past the viewport with no way to
// scroll the rest into view. A flat 70vh cap scrolled even on tall desktop
// screens that had room to show everything — calc(100vh-4.5rem) instead
// sizes the panel to (approximately) all the room actually available below
// the sticky header down to the bottom of the viewport, so it only falls
// back to the already-present overflow-y-auto when content genuinely
// doesn't fit.
const PANEL_CLASS =
  "fixed inset-4 z-40 m-auto h-fit max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-80 overflow-y-auto text-left sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:m-0 sm:mt-2 sm:h-auto sm:max-h-[calc(100vh-4.5rem)] sm:w-[30rem] sm:max-w-none";

// Compact "latest game" pill for the Dashboard header — just the two team
// logos and the final score of the picked league/team's most recently
// played game (see src/lib/dashboard-sports-picks.ts for the league/team
// picker in Settings). Clicking it opens the complete Sports card
// (sports-card.tsx) as a drop-down, same pattern as Markets/News/World
// Clock — every configured item shows in the expanded panel regardless of
// which one the compact pill itself previews, so here that means every
// league (not just the one/two picked to show in the pill).
//
// `desktop`/`mobile` can preview a different league in the compact pill
// (see Settings' "League shown on mobile" picker) — two independent
// trigger+drop-down pairs are rendered, one hidden at each breakpoint, each
// wired to its own open/closed state so a click always opens the pill that
// was actually clicked. Both drop-downs show the same `allSnapshots` list.
export default function HeaderSportsWidget({
  desktop,
  mobile,
  allSnapshots,
  hour12,
  lang,
  cardLabels,
  unavailableLabel,
}: {
  desktop: SportsHeaderPick;
  mobile: SportsHeaderPick;
  allSnapshots: SportsCardSnapshot[];
  hour12: boolean;
  lang: Lang;
  cardLabels: SportsLabels;
  unavailableLabel: string;
}) {
  const [openDesktop, setOpenDesktop] = useState(false);
  const [openMobile, setOpenMobile] = useState(false);
  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (desktopRef.current && !desktopRef.current.contains(e.target as Node)) setOpenDesktop(false);
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) setOpenMobile(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <>
      <div className="relative hidden sm:block" ref={desktopRef}>
        <Pill
          pick={desktop}
          unavailableLabel={unavailableLabel}
          compact={false}
          open={openDesktop}
          onToggle={() => setOpenDesktop((o) => !o)}
        />
        {openDesktop && (
          <div className={PANEL_CLASS}>
            <SportsCard initial={allSnapshots} hour12={hour12} lang={lang} labels={cardLabels} />
          </div>
        )}
      </div>
      <div className="relative sm:hidden" ref={mobileRef}>
        <Pill
          pick={mobile}
          unavailableLabel={unavailableLabel}
          compact={true}
          open={openMobile}
          onToggle={() => setOpenMobile((o) => !o)}
        />
        {openMobile && (
          <div className={PANEL_CLASS}>
            <SportsCard initial={allSnapshots} hour12={hour12} lang={lang} labels={cardLabels} />
          </div>
        )}
      </div>
    </>
  );
}
