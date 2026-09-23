"use client";

import { useEffect, useRef } from "react";

// A minimal rich-text field — a contentEditable surface plus a small
// formatting toolbar over `document.execCommand`. Deprecated but still
// universally supported for exactly this basic set (bold/italic/underline/
// lists/links/font/size/color/clear-formatting), and pulling in a full
// editor library for an event description field would be a lot of weight
// for what Google Calendar's own description box does. Value is the
// field's innerHTML.
const FONT_FAMILIES = [
  { value: "", label: "Default font" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Tahoma, Geneva, sans-serif", label: "Tahoma" },
];

// execCommand("fontSize", …) only ever accepts the legacy HTML 1-7 scale
// (it writes a <font size="n"> tag) — these px values are just this
// component's own labels for that scale, not sent anywhere.
const FONT_SIZES: { value: string; label: string }[] = [
  { value: "2", label: "Small" },
  { value: "3", label: "Normal" },
  { value: "5", label: "Large" },
  { value: "7", label: "Huge" },
];

export default function RichTextarea({
  value,
  onChange,
  placeholder,
  className,
  // Applied as the editor surface's own base CSS — never baked into the
  // stored HTML — so a fresh, still-empty field starts in the user's
  // preferred look; any actual content (typed or pasted) with its own
  // font/size still overrides this, same as any CSS default.
  defaultFontFamily,
  defaultFontSize,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  defaultFontFamily?: string | null;
  defaultFontSize?: string | null;
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

  // Firefox/Chrome use "hiliteColor" for a text-background highlight;
  // Safari only recognizes "backColor" for the same effect — trying
  // hiliteColor first and falling back keeps one button working everywhere
  // rather than picking whichever browser happens to be used to build this.
  function execBackground(color: string) {
    ref.current?.focus();
    const ok = document.execCommand("hiliteColor", false, color);
    if (!ok) document.execCommand("backColor", false, color);
    if (ref.current) onChange(ref.current.innerHTML);
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
        <select
          title="Font"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) exec("fontName", e.target.value);
            e.target.value = "";
          }}
          defaultValue=""
          className="h-7 max-w-[7rem] rounded border-0 bg-transparent px-1 text-xs text-ink outline-none hover:bg-black/5"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          title="Font size"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) exec("fontSize", e.target.value);
            e.target.value = "";
          }}
          defaultValue=""
          className="h-7 max-w-[5.5rem] rounded border-0 bg-transparent px-1 text-xs text-ink outline-none hover:bg-black/5"
        >
          <option value="" disabled>
            Size
          </option>
          {FONT_SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-card-border" />
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
        <span className="mx-0.5 h-5 w-px shrink-0 bg-card-border" />
        <label
          title="Text color"
          onMouseDown={(e) => e.preventDefault()}
          className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded text-ink hover:bg-black/5"
        >
          <span className="text-sm font-bold" style={{ textDecoration: "underline" }}>
            A
          </span>
          <input
            type="color"
            defaultValue="#000000"
            onInput={(e) => exec("foreColor", e.currentTarget.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <label
          title="Highlight color"
          onMouseDown={(e) => e.preventDefault()}
          className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded text-ink hover:bg-black/5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 11 6-6 4 4-6 6H9v-4Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 19 3-3" />
          </svg>
          <input
            type="color"
            defaultValue="#fff59d"
            onInput={(e) => execBackground(e.currentTarget.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
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
        style={{ fontFamily: defaultFontFamily || undefined, fontSize: defaultFontSize || undefined }}
        className="min-h-[8rem] px-3 py-2 text-sm text-ink outline-none empty:before:text-soft empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}
