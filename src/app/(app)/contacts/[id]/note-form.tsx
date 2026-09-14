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
        className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        {pending ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
