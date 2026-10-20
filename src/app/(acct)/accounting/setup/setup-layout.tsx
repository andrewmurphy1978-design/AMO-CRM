"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface SetupSection {
  id: string;
  label: string;
  hint?: string;
  count?: number;
  content: ReactNode;
}

// Setup's own left menu: one section shown at a time (remembered in the URL hash so a refresh stays put).
export default function SetupLayout({ sections }: { sections: SetupSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (h && sections.some((s) => s.id === h)) setActive(h);
  }, [sections]);
  const select = (id: string) => {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  };
  const current = sections.find((s) => s.id === active) ?? sections[0];
  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <nav className="flex gap-2 overflow-x-auto lg:sticky lg:top-24 lg:flex-col lg:self-start lg:overflow-visible" aria-label="Setup">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => select(s.id)}
            className={
              s.id === current.id
                ? "btn-primary flex shrink-0 items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left text-sm font-semibold shadow-sm"
                : "flex shrink-0 items-center justify-between gap-2 rounded-xl border border-card-border bg-card-bg px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-black/5"
            }
          >
            <span>{s.label}</span>
            {typeof s.count === "number" && (
              <span className={s.id === current.id ? "rounded-full bg-white/25 px-2 text-xs" : "rounded-full bg-black/10 px-2 text-xs text-soft"}>{s.count}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-6">{current.content}</div>
    </div>
  );
}
