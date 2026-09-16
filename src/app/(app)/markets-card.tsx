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
        <div className="mt-3 space-y-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">{labels.currencies}</p>
            <ul className="mt-1 space-y-1">
              {snapshot.currencies.map((c) => (
                <li key={c.code} className="flex justify-between">
                  <span className="text-soft">1 {snapshot.base}</span>
                  <span className="text-ink">
                    {c.rate.toFixed(4)} {c.code}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">{labels.crypto}</p>
            <ul className="mt-1 space-y-1">
              {snapshot.crypto.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span className="text-soft">{c.label}</span>
                  <span className="text-ink">
                    {c.usd !== null ? `$${c.usd.toLocaleString()}` : "—"}
                    {c.changePct24h !== null && (
                      <span className={c.changePct24h >= 0 ? "ml-1.5 text-emerald-600" : "ml-1.5 text-red-600"}>
                        {c.changePct24h >= 0 ? "+" : ""}
                        {c.changePct24h.toFixed(1)}%
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">{labels.indices}</p>
            <ul className="mt-1 space-y-1">
              {snapshot.indices.map((i) => (
                <li key={i.symbol} className="flex justify-between">
                  <span className="text-soft">{i.label}</span>
                  <span className="text-ink">{i.price !== null ? i.price.toLocaleString() : "—"}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">{labels.commodities}</p>
            <ul className="mt-1 space-y-1">
              {snapshot.commodities.map((c) => (
                <li key={c.symbol} className="flex justify-between">
                  <span className="text-soft">{c.label}</span>
                  <span className="text-ink">{c.price !== null ? c.price.toLocaleString() : "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
