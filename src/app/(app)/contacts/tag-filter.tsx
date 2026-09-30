"use client";

import { useEffect, useState } from "react";
import { groupTagsByCategory, tagPillStyle, type TagLike } from "@/lib/tag-colors";

// The Contacts list's Tags filter: same look as the other filter buttons,
// but opening the colour-coded tag picker (language, personal and
// systeme.io tags in their own groups, each pill in its own colour) instead
// of a plain checkbox list.
export default function TagFilter({
  tags,
  selected,
  placeholder,
  title,
  clearLabel,
  doneLabel,
  onChange,
}: {
  tags: ({ id: string } & TagLike)[];
  selected: string[]; // tag names
  placeholder: string;
  title: string;
  clearLabel: string;
  doneLabel: string;
  onChange: (names: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = groupTagsByCategory(tags);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  }

  const label = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-20 min-w-0 shrink-0 items-center justify-between gap-1 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30 sm:w-auto sm:min-w-[170px] sm:gap-2 sm:px-3 sm:py-2"
      >
        <span className={`truncate sm:hidden ${selected.length === 0 ? "text-soft" : ""}`}>{selected.length === 0 ? placeholder : selected.length}</span>
        <span className={`hidden truncate sm:inline ${selected.length === 0 ? "text-soft" : ""}`}>{label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0 text-soft">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl lg:max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-card-border px-4 py-3">
              <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
              <div className="flex items-center gap-3">
                {selected.length > 0 && (
                  <button type="button" onClick={() => onChange([])} className="text-sm text-soft hover:underline">
                    {clearLabel}
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm">
                  {doneLabel}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {[groups.language, groups.personal, groups.systemeIo].map(
                (group, i) =>
                  group.length > 0 && (
                    <div key={i} className={i > 0 ? "space-y-1 border-t border-card-border pt-2" : "space-y-1"}>
                      {group.map((tag) => {
                        const { className, style } = tagPillStyle(tag);
                        return (
                          <label key={tag.id} className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${className}`} style={style}>
                            <input
                              type="checkbox"
                              checked={selected.includes(tag.name)}
                              onChange={() => toggle(tag.name)}
                              className="h-4 w-4 rounded border-card-border accent-amo-lime"
                            />
                            {tag.name}
                          </label>
                        );
                      })}
                    </div>
                  )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
