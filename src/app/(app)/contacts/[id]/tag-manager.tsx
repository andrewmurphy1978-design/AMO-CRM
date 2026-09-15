"use client";

import { useRef, useTransition } from "react";
import { addTagToContact, removeTagFromContact } from "@/actions/contacts";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function TagManager({
  contactId,
  tags,
  lang,
}: {
  contactId: string;
  tags: { id: string; name: string }[];
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const t = getDict(lang);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1 rounded-full border border-card-border bg-black/5 px-2 py-1 text-xs text-ink"
          >
            {tag.name}
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => removeTagFromContact(contactId, tag.id))}
              className="text-soft hover:text-red-600"
              aria-label={`${t.tagManager.remove} ${tag.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <p className="text-sm text-soft">{t.tagManager.noTags}</p>}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = inputRef.current?.value.trim();
          if (!value) return;
          startTransition(() => addTagToContact(contactId, value));
          if (inputRef.current) inputRef.current.value = "";
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder={t.tagManager.addPlaceholder}
          className="flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5"
        >
          {t.tagManager.add}
        </button>
      </form>
    </div>
  );
}
