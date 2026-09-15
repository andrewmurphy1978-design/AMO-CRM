"use client";

import { useTransition } from "react";
import { deleteContact } from "@/actions/contacts";

export default function DeleteContactButton({ contactId }: { contactId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this contact? This cannot be undone.")) return;
        startTransition(() => deleteContact(contactId));
      }}
      className="rounded-md border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-60"
    >
      Delete
    </button>
  );
}
