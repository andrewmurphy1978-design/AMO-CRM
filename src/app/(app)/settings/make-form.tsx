"use client";

import { useActionState, useState, useTransition } from "react";
import { saveMakeApiKey, triggerMakeSync } from "@/actions/automations";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

export default function MakeForm({
  connected,
  zone,
  teamId,
  lastSyncedAt,
  lastSyncStatus,
  lastSyncError,
  lang,
}: {
  connected: boolean;
  zone: string;
  teamId: string;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lang: Lang;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveMakeApiKey, undefined);
  const [syncResult, setSyncResult] = useState<{ error?: string; success?: string } | null>(null);
  const [syncPending, startSync] = useTransition();
  const t = getDict(lang);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-soft">
          {t.automations.statusLabel}{" "}
          {connected ? (
            <span className="font-medium text-emerald-700">{t.automations.connected}</span>
          ) : (
            <span className="font-medium text-soft">{t.automations.notConnected}</span>
          )}
        </p>
        {lastSyncedAt && (
          <p className="mt-1 text-xs text-soft">
            {t.automations.lastSynced(new Date(lastSyncedAt).toLocaleString())} ·{" "}
            {lastSyncStatus === "error" ? (
              <span className="text-red-600">{t.automations.failed(lastSyncError ?? "")}</span>
            ) : (
              <span className="text-emerald-700">{t.automations.success}</span>
            )}
          </p>
        )}
      </div>

      <form action={saveAction} className="space-y-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
              {t.automations.apiKeyLabel}
            </label>
            <input name="apiKey" type="password" placeholder={t.automations.apiKeyPlaceholder} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
              {t.automations.zoneLabel}
            </label>
            <input name="zone" defaultValue={zone} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
              {t.automations.teamIdLabel}
            </label>
            <input name="teamId" defaultValue={teamId} className={FIELD_CLASS} />
          </div>
        </div>
        <button
          type="submit"
          disabled={savePending}
          className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
        >
          {savePending ? t.automations.saving : t.automations.saveKey}
        </button>
      </form>
      {saveState?.error && <p className="text-sm text-red-600">{saveState.error}</p>}
      {saveState?.success && <p className="text-sm text-emerald-700">{saveState.success}</p>}

      <button
        type="button"
        disabled={!connected || syncPending}
        onClick={() =>
          startSync(async () => {
            const result = await triggerMakeSync();
            setSyncResult(result);
          })
        }
        className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {syncPending ? t.automations.syncing : t.automations.syncNow}
      </button>
      {syncResult?.error && <p className="text-sm text-red-600">{syncResult.error}</p>}
      {syncResult?.success && <p className="text-sm text-emerald-700">{syncResult.success}</p>}
    </div>
  );
}
