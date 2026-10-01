"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useState } from "react";
import MultiSelect from "@/components/multi-select";
import CountryFlag from "@/components/country-flag";
import TagFilter from "./tag-filter";
import type { TagLike } from "@/lib/tag-colors";

// How long to wait after the last keystroke before re-querying — short
// enough to feel live, long enough that a fast typist doesn't fire a
// server round trip (and a full-page navigation) on every single letter.
const SEARCH_DEBOUNCE_MS = 300;

export default function ContactFilters({
  q,
  stageOptions,
  allTags,
  countryOptions,
  selectedStages,
  selectedTags,
  selectedCountries,
  searchPlaceholder,
  allStagesLabel,
  allTagsLabel,
  allCountriesLabel,
  tagDialogTitle,
  clearLabel,
  doneLabel,
  trailing,
}: {
  q: string;
  stageOptions: { value: string; label: string }[];
  allTags: ({ id: string } & TagLike)[];
  // value = ISO country code, label = full country name
  countryOptions: { value: string; label: string }[];
  selectedStages: string[];
  selectedTags: string[];
  selectedCountries: string[];
  searchPlaceholder: string;
  allStagesLabel: string;
  allTagsLabel: string;
  allCountriesLabel: string;
  tagDialogTitle: string;
  clearLabel: string;
  doneLabel: string;
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
  const [countries, setCountries] = useState(selectedCountries);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(nextStages: string[], nextTags: string[], nextQ: string, nextCountries: string[] = countries) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    for (const s of nextStages) params.append("stage", s);
    for (const tg of nextTags) params.append("tag", tg);
    for (const c of nextCountries) params.append("country", c);
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
        // A plain "search" box, not an address/payment field: a neutral name plus
        // autocomplete off (and password-manager opt-outs) stops the browser from
        // offering saved cards or addresses in its autofill drop-down.
        name="contact-list-filter"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={searchPlaceholder}
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
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
      <TagFilter
        tags={allTags}
        selected={tags}
        placeholder={allTagsLabel}
        title={tagDialogTitle}
        clearLabel={clearLabel}
        doneLabel={doneLabel}
        onChange={(next) => {
          setTags(next);
          push(stages, next, text);
        }}
      />
      <MultiSelect
        options={countryOptions}
        selected={countries}
        placeholder={allCountriesLabel}
        renderOption={(opt) => (
          <span className="flex min-w-0 items-center gap-2">
            <CountryFlag country={opt.value} />
            <span className="truncate">{opt.label}</span>
          </span>
        )}
        onChange={(next) => {
          setCountries(next);
          push(stages, tags, text, next);
        }}
      />
      {/* Desktop only: the pager + shown-count pill ride the end of this
          same row, as before. Mobile has no room left on the line, so the
          caller renders this same `trailing` node again, below the form. */}
      <div className="hidden sm:contents">{trailing}</div>
    </form>
  );
}
