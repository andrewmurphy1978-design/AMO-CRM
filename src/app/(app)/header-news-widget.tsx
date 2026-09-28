"use client";

import { useEffect, useRef, useState } from "react";
import type { NewsDigest } from "@/lib/news";
import NewsCard, { type NewsLabels } from "./news-card";

// Matches the Weather widget's own placeholder pill size/shape — see
// header-weather-widget.tsx's WeatherWidgetSkeleton for why this exists.
export function NewsWidgetSkeleton() {
  return <div className="hidden h-9 w-9 animate-pulse rounded-lg bg-white/10 sm:block" />;
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
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-amo-white transition-colors hover:bg-white/15"
        aria-label={labels.title}
      >
        <span className="text-lg leading-none" aria-hidden>
          📰
        </span>
        {headlineCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amo-gold px-1 text-[9px] font-bold text-amo-green">
            {headlineCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] text-left">
          <NewsCard initial={initial} labels={labels} />
        </div>
      )}
    </div>
  );
}
