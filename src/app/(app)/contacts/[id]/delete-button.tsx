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
      className="rounded-md border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-red-500/30 hover:border-red-300 disabled:opacity-60"
    >
      {t.common.delete}
    </button>
  );
}
