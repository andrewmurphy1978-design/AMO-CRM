"use client";

import { useRef, useTransition } from "react";
import { addContactNote } from "@/actions/contacts";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function NoteForm({ contactId, lang }: { contactId: string; lang: Lang }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const t = getDict(lang);

  return (
    <form
      ref={formRef}
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          await addContactNote(contactId, formData);
          formRef.current?.reset();
        });
      }}
    >
      <input
        name="note"
        type="text"
        placeholder={t.noteForm.placeholder}
        className="flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5"
      >
        {pending ? t.noteForm.adding : t.noteForm.add}
      </button>
    </form>
  );
}
