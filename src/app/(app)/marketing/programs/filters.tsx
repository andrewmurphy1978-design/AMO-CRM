"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

export default function AffiliateProgramFilters({
  q,
  category,
  categoryOptions,
  allCategoriesLabel,
  searchPlaceholder,
  trailing,
}: {
  q: string;
  category: string | null;
  categoryOptions: { value: string; label: string }[];
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
      <select
        value={category ?? ""}
        onChange={(e) => push(text, e.target.value || null)}
        className="rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      >
        <option value="">{allCategoriesLabel}</option>
        {categoryOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {trailing}
    </form>
  );
}
