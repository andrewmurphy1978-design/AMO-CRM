"use client";

import { useState } from "react";

// Same pill-button convention as the Marketing page's own category filter
// (active = solid btn-primary, inactive = outlined) — keeps My Settings and
// Admin Settings visually separate without needing two different pages,
// and each tab's content was already rendered server-side (this only ever
// toggles which pre-rendered tree is visible).
export default function SettingsTabs({
  tabs,
}: {
  tabs: { id: string; label: string; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);

  if (tabs.length <= 1) {
    return <>{tabs[0]?.content}</>;
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto border-b border-card-border pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={
              active === tab.id
                ? "btn-primary shrink-0 rounded-t-lg px-4 py-2 text-sm font-semibold shadow-sm"
                : "shrink-0 rounded-t-lg border border-b-0 border-transparent px-4 py-2 text-sm font-medium text-soft hover:text-ink"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-4 sm:mt-6">{tabs.find((tab) => tab.id === active)?.content}</div>
    </div>
  );
}
