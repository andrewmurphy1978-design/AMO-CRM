"use client";

import { useState, type ReactNode } from "react";

// A top line of tabs, one per entity, showing that entity's content only.
export default function EntityTabs({ tabs }: { tabs: { id: string; label: string; sub?: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto border-b border-card-border pb-px" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === current.id}
            onClick={() => setActive(t.id)}
            className={
              t.id === current.id
                ? "shrink-0 rounded-t-lg border border-b-0 border-card-border bg-card-bg px-4 py-2 text-sm font-semibold text-ink"
                : "shrink-0 rounded-t-lg px-4 py-2 text-sm font-medium text-soft hover:text-ink"
            }
          >
            {t.label}
            {t.sub && <span className="ml-2 text-xs font-normal text-soft">{t.sub}</span>}
          </button>
        ))}
      </div>
      {current.content}
    </div>
  );
}
