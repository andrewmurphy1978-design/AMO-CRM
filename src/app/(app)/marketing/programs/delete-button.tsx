"use client";

import { useTransition } from "react";
import { deleteAffiliateProgram } from "@/actions/affiliate-programs";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function DeleteAffiliateProgramButton({ programId, lang }: { programId: string; lang: Lang }) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(t.marketing.deleteProgramConfirm)) return;
        startTransition(() => deleteAffiliateProgram(programId));
      }}
      className="rounded-md border border-white/30 px-4 py-2 text-sm font-medium text-white hover:border-red-300 hover:bg-red-500/30 disabled:opacity-60"
    >
      {t.common.delete}
    </button>
  );
}
