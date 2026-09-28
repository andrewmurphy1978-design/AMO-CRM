"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketsSnapshot, MarketsWidgetCurrencyRow, MarketsWidgetItemRow } from "@/lib/markets";
import MarketsCard, { type MarketsLabels } from "./markets-card";

export interface MarketsWidgetData {
  currencyRow: MarketsWidgetCurrencyRow | null;
  itemRows: MarketsWidgetItemRow[];
}

// Matches the Weather widget's own placeholder pill size/shape — see
// header-weather-widget.tsx's WeatherWidgetSkeleton for why this exists.
export function MarketsWidgetSkeleton() {
  return <div className="hidden h-9 w-40 animate-pulse rounded-lg bg-white/10 sm:block" />;
}

function ChangeText({ changePct }: { changePct: number | null }) {
  if (changePct === null) return <span className="opacity-70">—</span>;
  return (
    <span className={changePct >= 0 ? "text-emerald-300" : "text-red-300"}>
      {changePct >= 0 ? "+" : ""}
      {changePct.toFixed(2)}%
    </span>
  );
}

// Compact "4 market info" pill for the Dashboard header — 1 currency
// conversion (1 CAD = x <code>) plus up to 3 other picks (indices/
// commodities/crypto), each showing its % change. Clicking it opens the
// exact same Markets card (markets-card.tsx) that used to sit as its own
// full-width Dashboard section — mounted lazily (only while open) so its
// own client-side CoinGecko fetch doesn't fire until the drop-down is
// actually shown.
export default function HeaderMarketsWidget({
  pill,
  snapshot,
  labels,
}: {
  pill: MarketsWidgetData | null;
  snapshot: MarketsSnapshot | null;
  labels: MarketsLabels;
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

  if (!pill || (!pill.currencyRow && pill.itemRows.length === 0)) {
    return (
      <div className="hidden items-center rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-amo-white/70 sm:flex">
        {labels.unavailable}
      </div>
    );
  }

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded-lg bg-white/10 px-2.5 py-1.5 text-amo-white transition-colors hover:bg-white/15"
      >
        {pill.currencyRow && (
          <span className="max-w-[7rem] min-w-0 text-center leading-tight">
            <span className="block truncate text-[9px] uppercase tracking-wide opacity-75">1 CAD</span>
            <span className="block truncate font-display text-xs font-bold tabular-nums">
              = {pill.currencyRow.rateFromBase.toFixed(4)}
              {pill.currencyRow.code}
            </span>
          </span>
        )}
        {pill.itemRows.map((item) => (
          <span key={item.key} className="max-w-[4.5rem] min-w-0 text-center leading-tight">
            <span className="block truncate text-[9px] uppercase tracking-wide opacity-75">{item.label}</span>
            <span className="block truncate font-display text-xs font-bold tabular-nums">
              <ChangeText changePct={item.changePct} />
            </span>
          </span>
        ))}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] text-left">
          <MarketsCard initial={snapshot} labels={labels} />
        </div>
      )}
    </div>
  );
}
