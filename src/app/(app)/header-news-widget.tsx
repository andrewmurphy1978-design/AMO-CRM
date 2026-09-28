"use client";

import { useEffect, useRef, useState } from "react";
import RefreshButton from "./refresh-button";
import { countryFlagUrl, QUEBEC_FLAG_URL } from "@/lib/flags";
import type { NewsDigest, NewsCategoryKey } from "@/lib/news";
import type { NewsLabels } from "./news-card";

const CATEGORY_ORDER: NewsCategoryKey[] = ["local", "montreal", "quebec", "canada", "us", "europe", "world"];

const CATEGORY_FLAGS: Partial<Record<NewsCategoryKey, string>> = {
  quebec: QUEBEC_FLAG_URL,
  canada: countryFlagUrl("ca"),
  us: countryFlagUrl("us"),
  europe: countryFlagUrl("eu"),
};

// Matches the Weather widget's own placeholder pill size/shape — see
// header-weather-widget.tsx's WeatherWidgetSkeleton for why this exists.
export function NewsWidgetSkeleton() {
  return <div className="hidden h-9 w-9 animate-pulse rounded-lg bg-white/10 sm:block" />;
}

// Condensed header pill for the same News digest news-card.tsx renders as a
// full-width Dashboard card — an icon that opens the digest as a drop-down,
// same click-to-open/click-outside-to-close pattern as Weather/World Clock.
export default function HeaderNewsWidget({ initial, labels }: { initial: NewsDigest | null; labels: NewsLabels }) {
  const [digest, setDigest] = useState(initial);
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
      const res = await fetch("/api/dashboard/news");
      if (res.ok) setDigest(await res.json());
    } catch {
      // Keep showing the last known digest rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

  const hasAnyItems = digest?.categories.some((c) => c.items.length > 0);
  const headlineCount = digest?.categories.reduce((n, c) => n + c.items.length, 0) ?? 0;

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
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-card-border bg-card-bg p-4 text-left shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-ink">{labels.title}</h3>
            <RefreshButton
              onClick={refresh}
              loading={loading}
              label={labels.refresh}
              loadingLabel={labels.refreshing}
            />
          </div>
          {!hasAnyItems ? (
            <p className="mt-2 text-sm text-soft">{labels.unavailable}</p>
          ) : (
            <div className="mt-2 max-h-96 divide-y divide-card-border overflow-y-auto">
              {CATEGORY_ORDER.map((key) => {
                const category = digest?.categories.find((c) => c.key === key);
                if (!category || category.items.length === 0) return null;
                const flag = CATEGORY_FLAGS[key];
                return (
                  <div key={key} className="py-2 first:pt-0 last:pb-0">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-soft">
                      {labels.categories[key]}
                      {key === "world" ? (
                        <span aria-hidden>🌍</span>
                      ) : (
                        flag && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={flag} alt="" className="h-3 w-4 rounded-[1px] object-cover" />
                        )
                      )}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {category.items.map((item, i) => (
                        <li key={i} className="min-w-0">
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-sm text-ink hover:text-emerald-700 hover:underline"
                            title={item.title}
                          >
                            {item.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
