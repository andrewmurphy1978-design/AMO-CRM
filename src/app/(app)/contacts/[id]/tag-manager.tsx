"use client";

import { useTransition } from "react";
import { addTagToContact, removeTagFromContact } from "@/actions/contacts";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { tagKind, TAG_KIND_COLORS, sortTags } from "@/lib/tag-colors";

export default function TagManager({
  contactId,
  tags,
  allTags,
  lang,
}: {
  contactId: string;
  tags: { id: string; name: string }[];
  allTags: { id: string; name: string }[];
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);

  const appliedIds = new Set(tags.map((tag) => tag.id));
  const availableTags = allTags.filter((tag) => !appliedIds.has(tag.id));
  const displayTags = sortTags(tags.map((tag) => ({ tag })));

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {displayTags.map(({ tag }) => (
          <span
            key={tag.id}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${TAG_KIND_COLORS[tagKind(tag.name)]}`}
          >
            {tag.name}
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => removeTagFromContact(contactId, tag.id))}
              className="opacity-70 hover:opacity-100"
              aria-label={`${t.tagManager.remove} ${tag.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <p className="text-sm text-soft">{t.tagManager.noTags}</p>}
      </div>
      <select
        disabled={pending || availableTags.length === 0}
        value=""
        onChange={(e) => {
          const name = e.target.value;
          if (!name) return;
          startTransition(() => addTagToContact(contactId, name));
        }}
        className="mt-3 w-full rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30 disabled:opacity-60"
      >
        <option value="">{t.contactDetail.addTagPlaceholder}</option>
        {availableTags.map((tag) => (
          <option key={tag.id} value={tag.name}>
            {tag.name}
          </option>
        ))}
      </select>
    </div>
  );
}
