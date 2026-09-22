"use client";

import { useEffect, useRef, useState } from "react";

export interface ColorOption {
  value: string; // "" for the calendar-default swatch
  label: string;
  swatch: string; // hex color to render as the circle
}

// A single-select dropdown that shows a colored circle beside each option's
// name, both in the closed trigger and in the open list — a plain <select>
// can't render anything but text inside its own <option> elements across
// browsers, so this is a custom popup instead, same pattern as MultiSelect.
export default function ColorSelect({
  options,
  value,
  onChange,
  className,
}: {
  options: ColorOption[];
  value: string;
  onChange: (value: string) => void;
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

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className={`relative ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      >
        <span className="h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: selected?.swatch }} />
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0 text-soft">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full min-w-[10rem] overflow-y-auto rounded-md border border-card-border bg-card-bg p-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 ${opt.value === value ? "bg-amo-lime/10" : ""}`}
            >
              <span className="h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: opt.swatch }} />
              <span className="truncate text-ink">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
