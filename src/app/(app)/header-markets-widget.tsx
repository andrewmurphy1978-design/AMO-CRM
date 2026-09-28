"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "@/lib/clsx";
import RefreshButton from "./refresh-button";
import type { MarketsWidgetCurrencyRow, MarketsWidgetItemRow } from "@/lib/markets";
import type { MarketsLabels } from "./markets-card";

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
// commodities/crypto), each showing its % change. Same click-to-open
// pattern as Weather/World Clock/News, but this data is cheap and static
// enough to show directly in the always-visible pill row instead of hiding
// it behind a click — the drop-down just repeats it a little larger.
export default function HeaderMarketsWidget({
  initial,
  labels,
}: {
  initial: MarketsWidgetData | null;
  labels: MarketsLabels;
}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/markets-widget");
      if (res.ok) setData(await res.json());
    } catch {
      // Keep showing the last known snapshot rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

  if (!data || (!data.currencyRow && data.itemRows.length === 0)) {
    return (
      <div className="hidden items-center rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-amo-white/70 sm:flex">
        {labels.unavailable}
      </div>
    );
  }

  const rows: { key: string; label: string; value: string; changePct: number | null }[] = [];
  if (data.currencyRow) {
    rows.push({
      key: `currency-${data.currencyRow.code}`,
      label: `1 CAD`,
      value: `${data.currencyRow.rateFromBase.toFixed(4)} ${data.currencyRow.code}`,
      changePct: data.currencyRow.changePct,
    });
  }
  for (const item of data.itemRows) {
    rows.push({ key: item.key, label: item.label, value: "", changePct: item.changePct });
  }

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded-lg bg-white/10 px-2.5 py-1.5 text-amo-white transition-colors hover:bg-white/15"
      >
        {rows.map((row) => (
          <span key={row.key} className="max-w-[4.5rem] min-w-0 text-center leading-tight">
            <span className="block truncate text-[9px] uppercase tracking-wide opacity-75">{row.label}</span>
            <span className="block truncate font-display text-xs font-bold tabular-nums">
              <ChangeText changePct={row.changePct} />
            </span>
          </span>
        ))}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-card-border bg-card-bg p-4 text-left shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-ink">{labels.title}</h3>
            <RefreshButton
              onClick={refresh}
              loading={loading}
              label={labels.refresh}
              loadingLabel={labels.refreshing}
            />
          </div>
          <ul className="mt-3 space-y-1.5 text-xs">
            {data.currencyRow && (
              <li className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-soft">
                  1 CAD = {data.currencyRow.rateFromBase.toFixed(4)} {data.currencyRow.code}
                </span>
                <span
                  className={clsx(
                    "shrink-0 font-semibold",
                    data.currencyRow.changePct === null
                      ? "text-soft"
                      : data.currencyRow.changePct >= 0
                        ? "text-emerald-600"
                        : "text-red-600"
                  )}
                >
                  {data.currencyRow.changePct === null
                    ? "—"
                    : `${data.currencyRow.changePct >= 0 ? "+" : ""}${data.currencyRow.changePct.toFixed(2)}%`}
                </span>
              </li>
            )}
            {data.itemRows.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-soft">{item.label}</span>
                <span
                  className={clsx(
                    "shrink-0 font-semibold",
                    item.changePct === null ? "text-soft" : item.changePct >= 0 ? "text-emerald-600" : "text-red-600"
                  )}
                >
                  {item.changePct === null ? "—" : `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
