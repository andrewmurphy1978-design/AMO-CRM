"use client";

import { useState, useTransition } from "react";
import { importGoogleContactsAction, type ImportGoogleContactsResult } from "@/actions/google-contacts";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function GoogleContactsImportForm({ connected, lang }: { connected: boolean; lang: Lang }) {
  const t = getDict(lang).googleContactsImport;
  const [result, setResult] = useState<ImportGoogleContactsResult | null>(null);
  const [pending, startImport] = useTransition();

  return (
    <div className="mt-4 border-t border-card-border pt-4">
      <p className="text-sm text-soft">{t.description}</p>
      <button
        type="button"
        disabled={!connected || pending}
        onClick={() =>
          startImport(async () => {
            const next = await importGoogleContactsAction();
            setResult(next);
          })
        }
        className="btn-primary mt-3 inline-block rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.importing : t.importButton}
      </button>
      {result?.error === "not_connected" && <p className="mt-2 text-sm text-red-600">{t.notConnected}</p>}
      {result?.error && result.error !== "not_connected" && <p className="mt-2 text-sm text-red-600">{result.error}</p>}
      {result?.success && (
        <p className="mt-2 text-sm text-emerald-700">
          {t.resultSummary(result.imported ?? 0, result.linked ?? 0, result.totalFetched ?? 0)}
        </p>
      )}
      <p className="mt-2 text-xs text-soft">{t.reconnectNote}</p>
    </div>
  );
}
