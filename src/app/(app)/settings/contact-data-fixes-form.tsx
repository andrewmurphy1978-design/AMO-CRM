"use client";

import { useState, useTransition } from "react";
import { backfillContactDataAction, type BackfillContactDataResult } from "@/actions/contact-data-fixes";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function ContactDataFixesForm({ lang }: { lang: Lang }) {
  const t = getDict(lang).contactDataFixes;
  const [result, setResult] = useState<BackfillContactDataResult | null>(null);
  const [pending, startFix] = useTransition();

  return (
    <div>
      <p className="text-sm text-soft">{t.description}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startFix(async () => {
            const next = await backfillContactDataAction();
            setResult(next);
          })
        }
        className="btn-primary mt-3 inline-block rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.fixing : t.fixButton}
      </button>
      {result?.error && <p className="mt-2 text-sm text-red-600">{result.error}</p>}
      {result?.success && (
        <p className="mt-2 text-sm text-emerald-700">{t.resultSummary(result.phoneNumbersFixed ?? 0, result.timeZonesFilled ?? 0)}</p>
      )}
    </div>
  );
}
