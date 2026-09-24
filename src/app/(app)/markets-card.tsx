"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "@/lib/clsx";
import RefreshButton from "./refresh-button";
import { countryFlagUrl } from "@/lib/flags";
import {
  CRYPTO_IDS,
  type CryptoPrice,
  type MarketsSnapshot,
} from "@/lib/markets";

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

// Every row across every group shares this exact column template — value,
// icon/flag, % change, value — so both the icon and the % change land in
// the same visual column no matter which section it's in.
const ROW_GRID = "grid grid-cols-[1fr_40px_48px_1fr] items-center gap-x-1.5";

function ChangeBadge({ changePct }: { changePct: number | null }) {
  if (changePct === null)
    return <span className="text-center text-soft">—</span>;
  return (
    <span
      className={clsx(
        "text-center",
        changePct >= 0 ? "text-emerald-600" : "text-red-600",
        Math.abs(changePct) > 1 && "font-bold",
      )}
    >
      {changePct >= 0 ? "+" : ""}
      {changePct.toFixed(2)}%
    </span>
  );
}

function FlagImg({ countryCode }: { countryCode: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={countryFlagUrl(countryCode)}
      alt=""
      className="h-3 w-4 shrink-0 rounded-[1px] object-cover"
    />
  );
}

// CoinGecko blocks Cloudflare Workers' shared IP range (confirmed via a
// live HTTP 403), so crypto prices are fetched directly from the visitor's
// own browser instead of proxied through the server — CoinGecko's public
// API is designed for direct client-side use and allows CORS.
async function fetchCryptoDirect(): Promise<CryptoPrice[] | null> {
  try {
    const ids = CRYPTO_IDS.map((c) => c.id).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number }
    >;
    return CRYPTO_IDS.map((c) => ({
      id: c.id,
      label: c.label,
      logo: c.logo,
      usd: data[c.id]?.usd ?? null,
      changePct24h: data[c.id]?.usd_24h_change ?? null,
    }));
  } catch {
    return null;
  }
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
  const triedClientCrypto = useRef(false);

  async function refreshCrypto() {
    const crypto = await fetchCryptoDirect();
    if (crypto) setSnapshot((prev) => (prev ? { ...prev, crypto } : prev));
  }

  useEffect(() => {
    if (triedClientCrypto.current) return;
    triedClientCrypto.current = true;
    refreshCrypto();
    // Only ever runs once, right after the SSR-rendered snapshot shows up,
    // to upgrade crypto with a value the server-side fetch can't get.
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const [res] = await Promise.all([
        fetch("/api/dashboard/markets"),
        refreshCrypto(),
      ]);
      if (res.ok) {
        const next = (await res.json()) as MarketsSnapshot;
        setSnapshot((prev) => (prev ? { ...next, crypto: prev.crypto } : next));
      }
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
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">
          {labels.title}
        </h2>
        <RefreshButton
          onClick={refresh}
          loading={loading}
          label={labels.refresh}
          loadingLabel={labels.refreshing}
        />
      </div>
      {!hasData || !snapshot ? (
        <p className="mt-1.5 sm:mt-3 text-sm text-soft">{labels.unavailable}</p>
      ) : (
        <div className="mt-1.5 sm:mt-3 space-y-4 text-xs">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">
              {labels.currencies}
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {snapshot.currencies.map((c) => (
                <li key={c.code} className={ROW_GRID}>
                  <span className="text-ink">
                    1 {snapshot.base} = {c.rateFromBase.toFixed(4)} {c.code}
                  </span>
                  <span className="flex items-center justify-center gap-0.5">
                    <FlagImg countryCode={snapshot.baseCountryCode} />
                    <FlagImg countryCode={c.countryCode} />
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
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">
              {labels.indices}
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {snapshot.indices.map((i) => (
                <li key={i.symbol} className={ROW_GRID}>
                  <span className="text-soft">{i.label}</span>
                  <span className="flex items-center justify-center">
                    {i.countryCode && <FlagImg countryCode={i.countryCode} />}
                  </span>
                  <ChangeBadge changePct={i.changePct} />
                  <span className="text-right text-ink">
                    {i.price !== null
                      ? `${i.price.toLocaleString()} ${i.currency}`
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">
              {labels.commodities}
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {snapshot.commodities.map((c) => (
                <li key={c.symbol} className={ROW_GRID}>
                  <span className="text-soft">{c.label}</span>
                  <span className="flex items-center justify-center text-base">
                    {c.icon}
                  </span>
                  <ChangeBadge changePct={c.changePct} />
                  <span className="text-right text-ink">
                    {c.price !== null
                      ? `${c.price.toLocaleString()} ${c.currency}`
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">
              {labels.crypto}
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {snapshot.crypto.map((c) => (
                <li key={c.id} className={ROW_GRID}>
                  <span className="text-soft">{c.label}</span>
                  <span className="flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.logo} alt="" className="h-4 w-4 shrink-0" />
                  </span>
                  <ChangeBadge changePct={c.changePct24h} />
                  <span className="text-right text-ink">
                    {c.usd !== null ? `${c.usd.toLocaleString()} USD` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
