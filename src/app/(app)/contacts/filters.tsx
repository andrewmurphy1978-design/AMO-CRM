"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useState } from "react";
import MultiSelect from "@/components/multi-select";

// How long to wait after the last keystroke before re-querying — short
// enough to feel live, long enough that a fast typist doesn't fire a
// server round trip (and a full-page navigation) on every single letter.
const SEARCH_DEBOUNCE_MS = 300;

export default function ContactFilters({
  q,
  stageOptions,
  tagOptions,
  selectedStages,
  selectedTags,
  searchPlaceholder,
  allStagesLabel,
  allTagsLabel,
  trailing,
}: {
  q: string;
  stageOptions: { value: string; label: string }[];
  tagOptions: { value: string; label: string }[];
  selectedStages: string[];
  selectedTags: string[];
  searchPlaceholder: string;
  allStagesLabel: string;
  allTagsLabel: string;
  // Rendered at the end of the same row as the filter controls on desktop
  // (the Previous/Next pager + shown-count pill) — on mobile the caller
  // renders this same content again, below the filter row instead, since
  // there's no room left for it on the single filter line.
  trailing?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(q);
  // Local state is the source of truth while the user is interacting —
  // selectedStages/selectedTags (URL-derived props) only catch up once
  // the router.push below actually lands, which is too slow to read back
  // from between two quick clicks in the same dropdown (each would see
  // the same stale prop and clobber the other's selection).
  const [stages, setStages] = useState(selectedStages);
  const [tags, setTags] = useState(selectedTags);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(nextStages: string[], nextTags: string[], nextQ: string) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    for (const s of nextStages) params.append("stage", s);
    for (const tg of nextTags) params.append("tag", tg);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    // No Filter button: every field applies itself the moment it changes —
    // the two MultiSelects already do (onChange fires per click), and the
    // text field re-queries a short debounce after each keystroke (so it
    // reads as "live" without firing a full page navigation on every
    // single letter) or immediately on Enter. `flex-nowrap` + tight `gap-2`
    // on mobile keeps all three fields on one line; `sm:flex-wrap sm:gap-3`
    // restores the original roomier desktop layout, where there was always
    // space to spare.
    <form className="flex flex-nowrap items-center gap-2 sm:flex-wrap sm:gap-3">
      <input
        type="search"
        value={text}
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => push(stages, tags, value), SEARCH_DEBOUNCE_MS);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (debounceRef.current) clearTimeout(debounceRef.current);
            push(stages, tags, text);
          }
        }}
        placeholder={searchPlaceholder}
        className="w-24 min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30 sm:w-64 sm:flex-none sm:px-3 sm:py-2"
      />
      <MultiSelect
        options={stageOptions}
        selected={stages}
        placeholder={allStagesLabel}
        onChange={(next) => {
          setStages(next);
          push(next, tags, text);
        }}
      />
      <MultiSelect
        options={tagOptions}
        selected={tags}
        placeholder={allTagsLabel}
        onChange={(next) => {
          setTags(next);
          push(stages, next, text);
        }}
      />
      {/* Desktop only: the pager + shown-count pill ride the end of this
          same row, as before. Mobile has no room left on the line, so the
          caller renders this same `trailing` node again, below the form. */}
      <div className="hidden sm:contents">{trailing}</div>
    </form>
  );
}
