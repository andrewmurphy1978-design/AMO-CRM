"use client";

import { useEffect, useRef } from "react";

// A minimal rich-text field — a contentEditable surface plus a small
// formatting toolbar over `document.execCommand`. Deprecated but still
// universally supported for exactly this basic set (bold/italic/underline/
// lists/links/clear-formatting), and pulling in a full editor library for
// an event description field would be a lot of weight for what Google
// Calendar's own description box does. Value is the field's innerHTML.
export default function RichTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef(value);

  // Only pushes `value` into the DOM when it changed from *outside* this
  // component (e.g. loading a different event) — contentEditable is
  // otherwise uncontrolled, and re-syncing on every keystroke would reset
  // the caret position mid-typing.
  useEffect(() => {
    if (value !== lastValue.current && ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
    lastValue.current = value;
  }, [value]);

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function insertLink() {
    const url = window.prompt("URL");
    if (url) exec("createLink", url);
  }

  const buttons: { command: string; label: string; icon: React.ReactNode; arg?: string }[] = [
    {
      command: "bold",
      label: "Bold",
      icon: <span className="font-bold">B</span>,
    },
    {
      command: "italic",
      label: "Italic",
      icon: <span className="italic">I</span>,
    },
    {
      command: "underline",
      label: "Underline",
      icon: <span className="underline">U</span>,
    },
    {
      command: "insertUnorderedList",
      label: "Bulleted list",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
          <path strokeLinecap="round" d="M9 6h11M9 12h11M9 18h11" />
        </svg>
      ),
    },
    {
      command: "insertOrderedList",
      label: "Numbered list",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" d="M9 6h11M9 12h11M9 18h11" />
          <text x="1" y="8" fontSize="7" fill="currentColor" stroke="none">
            1
          </text>
          <text x="1" y="14" fontSize="7" fill="currentColor" stroke="none">
            2
          </text>
          <text x="1" y="20" fontSize="7" fill="currentColor" stroke="none">
            3
          </text>
        </svg>
      ),
    },
  ];

  return (
    <div className={`rounded-md border border-card-border bg-field-bg shadow-sm ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-card-border p-1">
        {buttons.map((b) => (
          <button
            key={b.command}
            type="button"
            title={b.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(b.command, b.arg)}
            className="flex h-7 w-7 items-center justify-center rounded text-ink hover:bg-black/5"
          >
            {b.icon}
          </button>
        ))}
        <button
          type="button"
          title="Link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertLink}
          className="flex h-7 w-7 items-center justify-center rounded text-ink hover:bg-black/5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M13.5 6h2a4 4 0 010 8h-2M10.5 18h-2a4 4 0 010-8h2" />
          </svg>
        </button>
        <button
          type="button"
          title="Clear formatting"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("removeFormat")}
          className="flex h-7 w-7 items-center justify-center rounded text-ink hover:bg-black/5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12M6 6l1 13h6l1-13M10 10v6M14 10v6" />
            <path strokeLinecap="round" d="m4 4 16 16" />
          </svg>
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        data-placeholder={placeholder}
        className="min-h-[8rem] px-3 py-2 text-sm text-ink outline-none empty:before:text-soft empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}
