"use client";

import { useRef, useTransition } from "react";
import { addContactNote } from "@/actions/contacts";

export default function NoteForm({ contactId }: { contactId: string }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

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
        placeholder="Log a note or call..."
        className="flex-1 rounded-md border border-amo-border bg-white/5 px-3 py-1.5 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-amo-border px-3 py-1.5 text-sm font-medium text-amo-white hover:bg-white/10"
      >
        {pending ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
