"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncShortIoLinks } from "@/actions/affiliate-programs";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

type SyncOutcome = {
  error?: string;
  linked?: number;
  totalLinks?: number;
  statsUpdated?: number;
  statsError?: string;
  remainingForStats?: number;
};

export default function SyncShortIoButton({ lang }: { lang: Lang }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncOutcome | null>(null);
  const [statsUpdatedTotal, setStatsUpdatedTotal] = useState(0);
  const router = useRouter();
  const t = getDict(lang);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          setStatsUpdatedTotal(0);
          startTransition(async () => {
            // Cloudflare caps subrequests per Worker invocation, so the
            // server only fetches stats for a limited batch each call and
            // reports how many programs are still waiting — keep calling
            // until it reports none left, so one click finishes the job
            // instead of the admin having to click Sync repeatedly.
            let statsSoFar = 0;
            let outcome: SyncOutcome = await syncShortIoLinks();
            statsSoFar += outcome.statsUpdated ?? 0;
            while (!outcome.error && (outcome.remainingForStats ?? 0) > 0) {
              outcome = await syncShortIoLinks();
              statsSoFar += outcome.statsUpdated ?? 0;
            }
            setStatsUpdatedTotal(statsSoFar);
            setResult(outcome);
            if (!outcome.error) router.refresh();
          });
        }}
        className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.marketing.shortioSyncing : t.marketing.shortioSyncNow}
      </button>
      {result?.error && <p className="mt-1 text-sm text-red-600">{result.error}</p>}
      {result && !result.error && (
        <>
          <p className="mt-1 text-sm text-emerald-700">
            {t.marketing.shortioSynced(result.linked ?? 0, result.totalLinks ?? 0)}
            {t.marketing.shortioStatsSyncedCount(statsUpdatedTotal)}
          </p>
          {result.statsError && <p className="mt-1 text-sm text-red-600">{t.marketing.shortioStatsErrorBanner(result.statsError)}</p>}
        </>
      )}
    </div>
  );
}
