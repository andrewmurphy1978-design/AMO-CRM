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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter((opt) => opt.toLowerCase().includes(value.trim().toLowerCase()));

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
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className={inputClassName}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-card-border bg-card-bg shadow-lg">
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onClick={() => {
                  setValue(opt);
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
