"use client";

import { useState } from "react";
import RefreshButton from "./refresh-button";
import { countryFlagUrl, QUEBEC_FLAG_URL } from "@/lib/flags";
import type { NewsDigest, NewsCategoryKey } from "@/lib/news";

const CATEGORY_ORDER: NewsCategoryKey[] = ["local", "montreal", "quebec", "canada", "us", "europe", "world"];

const CATEGORY_FLAGS: Partial<Record<NewsCategoryKey, string>> = {
  quebec: QUEBEC_FLAG_URL,
  canada: countryFlagUrl("ca"),
  us: countryFlagUrl("us"),
  europe: countryFlagUrl("eu"),
};

export interface NewsLabels {
  title: string;
  refresh: string;
  refreshing: string;
  unavailable: string;
  categories: Record<NewsCategoryKey, string>;
}

export default function NewsCard({ initial, labels }: { initial: NewsDigest | null; labels: NewsLabels }) {
  const [digest, setDigest] = useState(initial);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <RefreshButton onClick={refresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} />
      </div>
      {!hasAnyItems ? (
        <p className="mt-3 text-sm text-soft">{labels.unavailable}</p>
      ) : (
        <div className="mt-3 divide-y divide-card-border">
          {CATEGORY_ORDER.map((key) => {
            const category = digest?.categories.find((c) => c.key === key);
            if (!category || category.items.length === 0) return null;
            const flag = CATEGORY_FLAGS[key];
            return (
              <div key={key} className="py-2 first:pt-0 last:pb-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
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
  );
}
