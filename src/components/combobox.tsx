"use client";

import { useEffect, useRef, useState } from "react";
import { FIELD_CLASS, LABEL_CLASS } from "@/app/(app)/contacts/[id]/section-dialog";

// A free-text combobox: types like a plain input (so a value not in
// `options` is always accepted and submitted), but offers a filtered,
// clickable dropdown of suggestions — unlike a native <input list="…">
// datalist, this can actually be styled to look like a real combobox.
export default function Combobox({
  label,
  name,
  defaultValue,
  options,
  placeholder,
  labelClassName = LABEL_CLASS,
  inputClassName = FIELD_CLASS,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: readonly string[];
  placeholder?: string;
  // Lets a caller hide the label at desktop (e.g. `${LABEL_CLASS} lg:hidden`)
  // when it's showing a column-header row instead — same convention every
  // other field in those "table via grid" dialogs already follows.
  labelClassName?: string;
  // Same idea for the input — e.g. `${FIELD_CLASS} lg:mt-0` to cancel the
  // label's margin-top once the label above it is hidden.
  inputClassName?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  // Show the full list until the user actually types — otherwise a field
  // already holding "IONOS" would only ever offer "IONOS".
  const [typed, setTyped] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const query = typed ? value.trim().toLowerCase() : "";
  const filtered = options.filter((opt) => opt.toLowerCase().includes(query));

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={name} className={labelClassName}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          setTyped(true);
          setOpen(true);
        }}
        onFocus={() => {
          setTyped(false);
          setOpen(true);
        }}
        className={`${inputClassName} pr-8`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setTyped(false);
          setOpen((o) => !o);
        }}
        className="absolute bottom-0 right-0 flex h-[38px] w-8 items-center justify-center text-soft hover:text-ink"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 4.5l4 4 4-4" />
        </svg>
      </button>
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-card-border bg-card-bg shadow-lg">
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onClick={() => {
                  setValue(opt);
                  setTyped(false);
                  setOpen(false);
                }}
                className="block w-full truncate px-3 py-1.5 text-left text-sm text-ink hover:bg-amo-gold/10"
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
