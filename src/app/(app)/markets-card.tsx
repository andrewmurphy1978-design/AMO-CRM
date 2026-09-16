"use client";

import { useState } from "react";
import RefreshButton from "./refresh-button";
import type { MarketsSnapshot } from "@/lib/markets";

export interface MarketsLabels {
  title: string;
  refresh: string;
  refreshing: string;
  unavailable: string;
  currencies: string;
  indices: string;
  commodities: string;
  crypto: string;
}

function ChangeBadge({ changePct }: { changePct: number | null }) {
  if (changePct === null) return <span className="text-soft">—</span>;
  return (
    <span className={changePct >= 0 ? "text-emerald-600" : "text-red-600"}>
      {changePct >= 0 ? "+" : ""}
      {changePct.toFixed(2)}%
    </span>
  );
}

export default function MarketsCard({
  initial,
  labels,
}: {
  initial: MarketsSnapshot | null;
  labels: MarketsLabels;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/markets");
      if (res.ok) setSnapshot(await res.json());
    } catch {
      // Keep showing the last known snapshot rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

  const hasData =
    !!snapshot &&
    (snapshot.currencies.length > 0 ||
      snapshot.crypto.some((c) => c.usd !== null) ||
      snapshot.indices.some((i) => i.price !== null) ||
      snapshot.commodities.some((c) => c.price !== null));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <RefreshButton onClick={refresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} />
      </div>
      {!hasData || !snapshot ? (
        <p className="mt-3 text-sm text-soft">{labels.unavailable}</p>
      ) : (
        <div className="mt-3 space-y-4 text-xs">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">{labels.currencies}</p>
            <ul className="mt-1.5 space-y-1.5">
              {snapshot.currencies.map((c) => (
                <li key={c.code} className="grid grid-cols-[1fr_auto_auto_1fr] items-center gap-x-1.5">
                  <span className="text-ink">
                    1 {snapshot.base} = {c.rateFromBase.toFixed(4)} {c.code}
                  </span>
                  <span className="text-sm">
                    {snapshot.baseFlag}/{c.flag}
                  </span>
                  <ChangeBadge changePct={c.changePct} />
                  <span className="text-right text-ink">
                    1 {c.code} = {c.rateToBase.toFixed(4)} {snapshot.base}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">{labels.indices}</p>
            <ul className="mt-1.5 space-y-1.5">
              {snapshot.indices.map((i) => (
                <li key={i.symbol} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-soft">
                    <span>{i.icon}</span> {i.label}
                  </span>
                  <ChangeBadge changePct={i.changePct} />
                  <span className="text-ink">{i.price !== null ? `${i.price.toLocaleString()} ${i.currency}` : "—"}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">{labels.commodities}</p>
            <ul className="mt-1.5 space-y-1.5">
              {snapshot.commodities.map((c) => (
                <li key={c.symbol} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-soft">
                    <span>{c.icon}</span> {c.label}
                  </span>
                  <ChangeBadge changePct={c.changePct} />
                  <span className="text-ink">{c.price !== null ? `${c.price.toLocaleString()} ${c.currency}` : "—"}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">{labels.crypto}</p>
            <ul className="mt-1.5 space-y-1.5">
              {snapshot.crypto.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-soft">
                    <span>{c.icon}</span> {c.label}
                  </span>
                  <ChangeBadge changePct={c.changePct24h} />
                  <span className="text-ink">{c.usd !== null ? `${c.usd.toLocaleString()} USD` : "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
