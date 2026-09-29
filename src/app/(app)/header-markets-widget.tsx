"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketsSnapshot, MarketsWidgetCurrencyRow, MarketsWidgetItemRow } from "@/lib/markets";
import { countryFlagUrl } from "@/lib/flags";
import MarketsCard, { fetchCryptoDirect, type MarketsLabels } from "./markets-card";

// The base currency is always CAD in this app (see src/lib/markets.ts) —
// MarketsWidgetCurrencyRow only carries the *target* currency's country
// code, so this is the one fixed flag the pill needs for the "1 CAD" side.
const CAD_COUNTRY_CODE = "ca";

export interface MarketsWidgetData {
  currencyRow: MarketsWidgetCurrencyRow | null;
  itemRows: MarketsWidgetItemRow[];
}

// Matches the Weather widget's own placeholder pill size/shape — see
// header-weather-widget.tsx's WeatherWidgetSkeleton for why this exists.
export function MarketsWidgetSkeleton() {
  return <div className="h-9 w-40 animate-pulse rounded-lg bg-white/10" />;
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

// Centers the drop-down panel on the viewport on mobile — see the
// identical comment on header-sports-widget.tsx's PANEL_CLASS.
const PANEL_CLASS =
  "fixed inset-4 z-40 m-auto h-fit max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[26rem] overflow-y-auto text-left sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:m-0 sm:mt-2 sm:h-auto sm:max-h-none sm:w-[26rem] sm:max-w-none";

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
  mobileItemKey,
}: {
  pill: MarketsWidgetData | null;
  snapshot: MarketsSnapshot | null;
  labels: MarketsLabels;
  // Which of pill.itemRows shows on mobile (there's only room for one,
  // next to the currency row) — see Settings' "Item shown on mobile"
  // picker. Falls back to the first item row when unset/not found.
  mobileItemKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pillData, setPillData] = useState(pill);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // The pill's own data is a server-only snapshot — any crypto pick in it
  // (e.g. Bitcoin) has a null % change, since CoinGecko blocks Cloudflare
  // Workers' shared IPs (see fetchCryptoDirect's own comment). The full
  // Markets card below already works around that with a client-side
  // CoinGecko fetch once it's opened; this applies the same fix directly
  // to the pill so a crypto pick doesn't sit blank until the user clicks
  // it open.
  useEffect(() => {
    if (!pill?.itemRows.some((row) => row.key.startsWith("crypto:"))) return;
    fetchCryptoDirect().then((crypto) => {
      if (!crypto) return;
      setPillData((prev) =>
        prev
          ? {
              ...prev,
              itemRows: prev.itemRows.map((row) => {
                if (!row.key.startsWith("crypto:")) return row;
                const id = row.key.slice("crypto:".length);
                const match = crypto.find((c) => c.id === id);
                return match ? { ...row, changePct: match.changePct24h } : row;
              }),
            }
          : prev,
      );
    });
    // Only ever runs once, right after the SSR-rendered pill shows up, to
    // upgrade any crypto row with a value the server-side fetch can't get.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!pillData || (!pillData.currencyRow && pillData.itemRows.length === 0)) {
    return (
      <div className="flex max-w-[6rem] items-center truncate rounded-lg bg-white/10 px-1.5 py-0.5 text-[10px] text-amo-white/70 sm:max-w-none sm:px-2.5 sm:py-1.5 sm:text-xs">
        {labels.unavailable}
      </div>
    );
  }

  // Mobile only has room for one element total — the item chosen in
  // Settings (falling back to the first configured item), or the currency
  // row when no item is configured at all. Desktop still shows the
  // currency row plus every item row.
  const mobileItem =
    pillData.itemRows.find((item) => item.key === mobileItemKey) ?? pillData.itemRows[0] ?? null;
  const currencyCell = pillData.currencyRow && (
    <span className="flex items-center gap-1 whitespace-nowrap text-[10px] font-bold tabular-nums sm:text-xs">
      1
      {/* eslint-disable-next-line @next/next/no-img-element -- external flag CDN, not a local asset */}
      <img
        src={countryFlagUrl(CAD_COUNTRY_CODE)}
        alt="CAD"
        title="CAD"
        className="h-2.5 w-3.5 shrink-0 rounded-[1px] object-cover"
      />
      = {pillData.currencyRow.rateFromBase.toFixed(2)}
      {/* eslint-disable-next-line @next/next/no-img-element -- external flag CDN, not a local asset */}
      <img
        src={countryFlagUrl(pillData.currencyRow.countryCode)}
        alt={pillData.currencyRow.code}
        title={pillData.currencyRow.code}
        className="h-2.5 w-3.5 shrink-0 rounded-[1px] object-cover"
      />
    </span>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg bg-white/10 px-1.5 py-0.5 text-amo-white transition-colors hover:bg-white/15 sm:gap-3 sm:px-2.5 sm:py-1.5"
      >
        {/* Mobile: exactly one element — the picked item as "LABEL pct%"
            on a single line, or the currency row if no item is set up. */}
        <span className="sm:hidden">
          {mobileItem ? (
            <span className="flex items-center gap-1 whitespace-nowrap text-[10px] font-bold">
              <span className="uppercase tracking-wide opacity-75">{mobileItem.label}</span>
              <ChangeText changePct={mobileItem.changePct} />
            </span>
          ) : (
            currencyCell
          )}
        </span>
        {/* Desktop: currency row plus every configured item, unchanged. */}
        <span className="hidden sm:contents">
          {currencyCell}
          {pillData.itemRows.map((item) => (
            <span key={item.key} className="max-w-[4.5rem] min-w-0 text-center leading-tight">
              <span className="block truncate text-[9px] uppercase tracking-wide opacity-75">{item.label}</span>
              <span className="block truncate font-display text-xs font-bold tabular-nums">
                <ChangeText changePct={item.changePct} />
              </span>
            </span>
          ))}
        </span>
      </button>
      {open && (
        <div className={PANEL_CLASS}>
          <MarketsCard initial={snapshot} labels={labels} />
        </div>
      )}
    </div>
  );
}
