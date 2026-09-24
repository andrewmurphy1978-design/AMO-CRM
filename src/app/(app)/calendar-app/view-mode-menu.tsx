"use client";

import { useEffect, useRef, useState } from "react";

// Mobile only: the Month/Week/5-Day/3-Day/Day/Table row of six buttons has
// no room on a narrow screen, so it collapses into one dropdown trigger
// showing the current view — same pattern as the Email page's Gmail/IONOS
// menu. Desktop keeps the full button row (rendered by the caller, hidden
// below `sm`) unchanged.
export default function ViewModeMenu<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (key: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const current = options.find((o) => o.key === value);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-lg border border-card-border bg-card-bg px-2 py-1 text-xs font-medium text-ink hover:bg-black/5"
      >
        {current?.label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3 w-3 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-card-border bg-card-bg py-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm ${
                o.key === value ? "bg-black/5 font-semibold text-ink" : "text-ink hover:bg-black/5"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
