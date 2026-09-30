"use client";

import { useState, useTransition } from "react";
import { addTagToContact, removeTagFromContact } from "@/actions/contacts";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { tagPillStyle, groupTagsByCategory, type TagLike } from "@/lib/tag-colors";

const LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide text-soft";

export default function TagManager({
  contactId,
  tags,
  allTags,
  lang,
}: {
  contactId: string;
  tags: ({ id: string } & TagLike)[];
  allTags: ({ id: string } & TagLike)[];
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const t = getDict(lang);

  const appliedIds = new Set(tags.map((tag) => tag.id));
  const appliedGroups = groupTagsByCategory(tags);
  const displayGroups = {
    language: appliedGroups.language,
    other: [...appliedGroups.personal, ...appliedGroups.systemeIo],
  };
  const groups = groupTagsByCategory(allTags);

  function toggle(tag: { id: string } & TagLike) {
    startTransition(() => {
      if (appliedIds.has(tag.id)) removeTagFromContact(contactId, tag.id);
      else addTagToContact(contactId, tag.name);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <p className={LABEL_CLASS}>{t.contactForm.tags}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t.tagManager.manage}
          aria-label={t.tagManager.manage}
          className="flex h-4 w-4 items-center justify-center rounded-full bg-black/10 text-soft hover:bg-black/20 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5">
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {/* Language tags get the first line to themselves; every other tag
          wraps on the lines below it. */}
      <div className="mt-1.5 space-y-1.5">
        {[displayGroups.language, displayGroups.other].map(
          (row, i) =>
            row.length > 0 && (
              <div key={i} className="flex flex-wrap gap-2">
                {row.map((tag) => {
                  const style = tagPillStyle(tag);
                  return (
                    <span
                      key={tag.id}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${style.className}`}
                      style={style.style}
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
                  );
                })}
              </div>
            )
        )}
        {tags.length === 0 && <p className="text-sm text-soft">{t.tagManager.noTags}</p>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl lg:max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-card-border px-4 py-3">
              <h3 className="font-display text-base font-semibold text-ink">{t.tagManager.allTagsTitle}</h3>
              <button type="button" onClick={() => setOpen(false)} className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm">
                {t.tagManager.done}
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {[groups.language, groups.personal, groups.systemeIo].map(
                (group, i) =>
                  group.length > 0 && (
                    <div key={i} className={i > 0 ? "space-y-1 border-t border-card-border pt-2" : "space-y-1"}>
                      {group.map((tag) => {
                        const { className, style } = tagPillStyle(tag);
                        return (
                          <label
                            key={tag.id}
                            className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${className}`}
                            style={style}
                          >
                            <input
                              type="checkbox"
                              checked={appliedIds.has(tag.id)}
                              disabled={pending}
                              onChange={() => toggle(tag)}
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
    </div>
  );
}
