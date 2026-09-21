"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshAffiliateProgramStats } from "@/actions/affiliate-programs";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function RefreshStatsButton({ programId, lang }: { programId: string; lang: Lang }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const t = getDict(lang);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await refreshAffiliateProgramStats(programId);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
        className="text-xs font-semibold text-amo-lime hover:underline disabled:opacity-60"
      >
        {pending ? t.marketing.statsRefreshing : t.marketing.statsRefresh}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
