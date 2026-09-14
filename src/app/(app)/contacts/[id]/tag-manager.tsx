"use client";

import { useRef, useTransition } from "react";
import { addTagToContact, removeTagFromContact } from "@/actions/contacts";

export default function TagManager({
  contactId,
  tags,
}: {
  contactId: string;
  tags: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
          >
            {tag.name}
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => removeTagFromContact(contactId, tag.id))}
              className="text-slate-400 hover:text-red-600"
              aria-label={`Remove ${tag.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <p className="text-sm text-slate-500">No tags yet.</p>}
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
          placeholder="Add a tag..."
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Add
        </button>
      </form>
    </div>
  );
}
