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
        title={pending ? t.marketing.shortioSyncing : t.marketing.shortioSyncNow}
        aria-label={pending ? t.marketing.shortioSyncing : t.marketing.shortioSyncNow}
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
        className="btn-primary flex items-center justify-center gap-1.5 rounded-lg p-1.5 shadow-sm disabled:opacity-60 sm:px-4 sm:py-2 sm:text-sm sm:font-semibold"
      >
        {/* Mobile: bare icon, same convention as every other header
            button — this one was previously full-width text only, which
            squeezed the page title down to nothing once a second header
            button (Add Program) joined it. Desktop/tablet (sm+) keeps
            the label, unchanged. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          className={`h-3.5 w-3.5 shrink-0 ${pending ? "animate-spin" : ""}`}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
        <span className="hidden sm:inline">{pending ? t.marketing.shortioSyncing : t.marketing.shortioSyncNow}</span>
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
