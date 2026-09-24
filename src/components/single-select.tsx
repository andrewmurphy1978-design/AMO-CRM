"use client";

import { useEffect, useRef, useState } from "react";

// Same look and interaction as MultiSelect (a real dropdown panel, not the
// OS's own native <select> picker) but for a single choice instead of a
// checkbox list — picking an option applies it immediately and closes the
// panel. Used where Contacts' MultiSelect pattern is expected but the
// underlying value can only ever be one thing at a time (e.g. a category).
export default function SingleSelect({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: string | null; label: string; count?: number }[];
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const current = options.find((opt) => opt.value === value) ?? options[0];

  return (
    <div className={`relative min-w-0 shrink-0 ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-28 min-w-0 items-center justify-between gap-1 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      >
        <span className="truncate">{current?.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0 text-soft">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        // `right-0` keeps the panel from overflowing past the viewport when
        // this trigger sits near the right edge of a narrow filter row —
        // same reasoning as MultiSelect's own dropdown.
        <div className="absolute right-0 z-30 mt-1 max-h-64 w-56 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-card-border bg-card-bg p-2 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value ?? "ALL"}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-field-bg ${
                value === opt.value ? "font-semibold text-ink" : "text-ink"
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {opt.count !== undefined && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-black/10 px-1.5 text-xs font-semibold text-ink/70">
                  {opt.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
