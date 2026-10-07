"use client";

import { useRef, useState, type ChangeEvent, type FocusEvent } from "react";
import { useLang } from "@/components/lang-context";

// A date field that reads like a sentence until you edit it: "October 10, 2026" / "10 octobre 2026"
// when it is not focused, and the yyyy-mm-dd mask when it has focus (typing adds the dashes by itself).
// A small calendar button opens the browser's date picker. It is a drop-in for <input type="date">:
// value / defaultValue / name / onChange (with e.target.value) / required / disabled / min / max / className.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function validIso(v: string): boolean {
  if (!ISO.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function longDate(iso: string, lang: "en" | "fr"): string {
  if (!validIso(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

// 20261010 -> 2026-10-10 as the digits are typed
function mask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export interface DateInputProps {
  value?: string;
  defaultValue?: string;
  name?: string;
  id?: string;
  title?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  onChange?: (e: { target: { value: string } }) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
}

export default function DateInput({ value, defaultValue, name, id, title, className, required, disabled, min, max, onChange, onBlur }: DateInputProps) {
  const lang = useLang();
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const iso = controlled ? value : inner;
  const [text, setText] = useState<string | null>(null); // the mask text while the field has focus
  const picker = useRef<HTMLInputElement>(null);

  const commit = (next: string) => {
    if (!controlled) setInner(next);
    onChange?.({ target: { value: next } });
  };

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    const typed = (text ?? "").trim();
    if (typed === "") {
      if (iso) commit("");
    } else if (validIso(typed)) {
      if (typed !== iso) commit(typed);
    } // anything else: the previous date stays
    setText(null);
    onBlur?.(e);
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        id={id}
        title={title}
        autoComplete="off"
        disabled={disabled}
        required={required}
        placeholder={text !== null ? "yyyy-mm-dd" : undefined}
        value={text !== null ? text : longDate(iso, lang)}
        onFocus={(e) => {
          setText(iso);
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setText(mask(e.target.value))}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text !== null) (e.currentTarget as HTMLInputElement).blur();
        }}
        className={`${className ?? ""} pr-9`}
      />
      {name && <input type="hidden" name={name} value={iso} />}
      {!disabled && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label={lang === "fr" ? "Choisir une date" : "Pick a date"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const el = picker.current;
              if (!el) return;
              try {
                el.showPicker();
              } catch {
                el.focus();
              }
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-sm leading-none text-soft hover:text-ink"
          >
            📅
          </button>
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={validIso(iso) ? iso : ""}
            min={min}
            max={max}
            onChange={(e) => {
              if (e.target.value) commit(e.target.value);
              setText(null);
            }}
            className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
          />
        </>
      )}
    </div>
  );
}
