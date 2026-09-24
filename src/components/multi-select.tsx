"use client";

import { useEffect, useRef, useState } from "react";

export default function MultiSelect({
  options,
  selected,
  placeholder,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
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

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  }

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? placeholder)
        : `${selected.length} selected`;

  return (
    <div className="relative min-w-0 shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-20 min-w-0 items-center justify-between gap-1 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30 sm:w-auto sm:min-w-[170px] sm:gap-2 sm:px-3 sm:py-2"
      >
        {/* Mobile: just the count of selected items (or the placeholder when
            none are picked) — full labels don't fit next to two other filter
            fields on one line. The dropdown panel below still lists every
            choice either way. Desktop keeps the fuller label/"-selected" text. */}
        <span className={`truncate sm:hidden ${selected.length === 0 ? "text-soft" : ""}`}>
          {selected.length === 0 ? placeholder : selected.length}
        </span>
        <span className={`hidden truncate sm:inline ${selected.length === 0 ? "text-soft" : ""}`}>{label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0 text-soft">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        // Above the Contacts table's sticky header (z-20) — same z-index on
        // both meant DOM order decided the winner, and the header (later in
        // the document) painted over this dropdown instead of the other way
        // around.
        // `right-0` on mobile: the trigger is now a narrow box that can sit
        // near the right edge of the screen (Tags is the 3rd of 3 fields on
        // one line) — anchoring the panel's right edge to the trigger's
        // keeps it from overflowing past the viewport. Desktop's wider,
        // more centered triggers keep the original left-aligned opening.
        <div className="absolute right-0 z-30 mt-1 max-h-64 w-56 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-card-border bg-card-bg p-2 shadow-lg sm:left-0 sm:right-auto">
          {options.length === 0 && <p className="px-2 py-1.5 text-sm text-soft">—</p>}
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-field-bg"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="h-4 w-4 rounded border-card-border"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
