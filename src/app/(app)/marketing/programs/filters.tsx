"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

export default function AffiliateProgramFilters({
  q,
  category,
  categoryOptions,
  allCategoriesCount,
  allCategoriesLabel,
  searchPlaceholder,
  trailing,
}: {
  q: string;
  category: string | null;
  categoryOptions: { value: string; label: string; count: number }[];
  allCategoriesCount: number;
  allCategoriesLabel: string;
  searchPlaceholder: string;
  // Rendered at the end of the same flex-wrap row as the filter controls
  // (the shown-count pill) rather than on their own line above it.
  trailing?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(q);

  function push(nextQ: string, nextCategory: string | null) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextCategory) params.set("category", nextCategory);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        push(text, category);
      }}
    >
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => push(text, category)}
        placeholder={searchPlaceholder}
        className="w-64 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      />
      <div className="flex flex-wrap gap-2">
        {(
          [{ value: null, label: allCategoriesLabel, count: allCategoriesCount }, ...categoryOptions] as {
            value: string | null;
            label: string;
            count: number;
          }[]
        ).map((opt) => (
          <button
            key={opt.value ?? "ALL"}
            type="button"
            onClick={() => push(text, opt.value)}
            className={
              category === opt.value
                ? "btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm"
                : "inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5"
            }
          >
            {opt.label}
            <span
              className={
                category === opt.value
                  ? "flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold"
                  : "flex h-5 min-w-5 items-center justify-center rounded-full bg-black/10 px-1.5 text-xs font-semibold text-ink/70"
              }
            >
              {opt.count}
            </span>
          </button>
        ))}
      </div>
      {trailing}
    </form>
  );
}
