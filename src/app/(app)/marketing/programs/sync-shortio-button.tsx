"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncShortIoLinks } from "@/actions/affiliate-programs";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function SyncShortIoButton({ lang }: { lang: Lang }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; linked?: number; totalLinks?: number; statsError?: string } | null>(null);
  const router = useRouter();
  const t = getDict(lang);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const outcome = await syncShortIoLinks();
            setResult(outcome);
            if (!outcome.error) router.refresh();
          });
        }}
        className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
      >
        {pending ? t.marketing.shortioSyncing : t.marketing.shortioSyncNow}
      </button>
      {result?.error && <p className="mt-1 text-sm text-red-600">{result.error}</p>}
      {result && !result.error && (
        <>
          <p className="mt-1 text-sm text-emerald-700">{t.marketing.shortioSynced(result.linked ?? 0, result.totalLinks ?? 0)}</p>
          {result.statsError && <p className="mt-1 text-sm text-red-600">{t.marketing.shortioStatsErrorBanner(result.statsError)}</p>}
        </>
      )}
    </div>
  );
}
