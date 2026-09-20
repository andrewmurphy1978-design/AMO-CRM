"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import MultiSelect from "@/components/multi-select";

export default function ContactFilters({
  q,
  stageOptions,
  tagOptions,
  selectedStages,
  selectedTags,
  searchPlaceholder,
  allStagesLabel,
  allTagsLabel,
  filterLabel,
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
  filterLabel: string;
  // Rendered at the end of the same flex-wrap row as the filter controls
  // (the shown-count pill + New contact button) rather than on their own
  // line above it.
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

  function push(nextStages: string[], nextTags: string[], nextQ: string) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    for (const s of nextStages) params.append("stage", s);
    for (const tg of nextTags) params.append("tag", tg);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        push(stages, tags, text);
      }}
    >
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={searchPlaceholder}
        className="w-64 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
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
      <button
        type="submit"
        className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
      >
        {filterLabel}
      </button>
      {trailing}
    </form>
  );
}
