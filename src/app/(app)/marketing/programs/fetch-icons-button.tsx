"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchMissingAffiliateIconsAction } from "@/actions/affiliate-programs";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function FetchIconsButton({ lang }: { lang: Lang }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; filled?: number } | null>(null);
  const router = useRouter();
  const t = getDict(lang);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await fetchMissingAffiliateIconsAction();
            setResult(outcome);
            if (!outcome.error) router.refresh();
          })
        }
        className="rounded-lg border border-card-border px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:bg-black/5 disabled:opacity-60"
      >
        {pending ? t.marketing.fetchIconsFetching : t.marketing.fetchIconsButton}
      </button>
      {result?.error && <p className="mt-1 text-sm text-red-600">{result.error}</p>}
      {result && !result.error && <p className="mt-1 text-sm text-emerald-700">{t.marketing.fetchIconsResult(result.filled ?? 0)}</p>}
    </div>
  );
}
