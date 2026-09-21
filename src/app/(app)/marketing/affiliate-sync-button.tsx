"use client";

import { useState, useTransition } from "react";
import { triggerAffiliateSheetSync } from "@/actions/integrations";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function AffiliateSyncButton({ lang }: { lang: Lang }) {
  const t = getDict(lang);
  const [result, setResult] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await triggerAffiliateSheetSync());
          })
        }
        className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.marketing.affiliateSyncing : t.marketing.affiliateSyncNow}
      </button>
      {result?.error && <p className="text-xs text-red-600">{result.error}</p>}
      {result?.success && <p className="text-xs text-emerald-700">{result.success}</p>}
    </div>
  );
}
