"use client";

import { useTransition } from "react";
import { deleteContact } from "@/actions/contacts";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function DeleteContactButton({ contactId, lang }: { contactId: string; lang: Lang }) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(t.contactDetail.deleteConfirm)) return;
        startTransition(() => deleteContact(contactId));
      }}
      title={t.common.delete}
      aria-label={t.common.delete}
      className="flex items-center justify-center gap-1.5 rounded-md border border-white/30 p-2 text-sm font-medium text-white hover:border-red-300 hover:bg-red-500/30 disabled:opacity-60 sm:px-4 sm:py-2"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12" />
      </svg>
      <span className="hidden sm:inline">{t.common.delete}</span>
    </button>
  );
}
