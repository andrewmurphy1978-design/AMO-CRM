"use client";

import { useEffect, useRef, useState } from "react";
import type { NewsDigest } from "@/lib/news";
import NewsCard, { type NewsLabels } from "./news-card";

// Matches the Weather widget's own placeholder pill size/shape — see
// header-weather-widget.tsx's WeatherWidgetSkeleton for why this exists.
export function NewsWidgetSkeleton() {
  return <div className="h-6 w-6 animate-pulse rounded-lg bg-white/10 sm:h-9 sm:w-9" />;
}

// Condensed header pill that opens the exact same News card
// (news-card.tsx) that used to sit as its own full-width Dashboard
// section — now shown as a click-to-open drop-down instead, same pattern
// as Weather/World Clock/Markets. NewsCard owns its own refresh/loading
// state, so this wrapper only needs the open/closed state and a static
// headline count for the badge.
export default function HeaderNewsWidget({ initial, labels }: { initial: NewsDigest | null; labels: NewsLabels }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const headlineCount = initial?.categories.reduce((n, c) => n + c.items.length, 0) ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 text-amo-white transition-colors hover:bg-white/15 sm:h-9 sm:w-9"
        aria-label={labels.title}
      >
        <span className="text-xs leading-none sm:text-lg" aria-hidden>
          📰
        </span>
        {headlineCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amo-gold px-1 text-[8px] font-bold text-amo-green sm:h-4 sm:min-w-4 sm:text-[9px]">
            {headlineCount}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-4 z-40 m-auto h-fit max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-80 overflow-y-auto text-left sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:m-0 sm:mt-2 sm:h-auto sm:max-h-none sm:w-80 sm:max-w-none">
          <NewsCard initial={initial} labels={labels} />
        </div>
      )}
    </div>
  );
}
