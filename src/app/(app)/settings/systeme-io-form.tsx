"use client";

import { useActionState, useState, useTransition } from "react";
import {
  saveSystemeIoApiKey,
  triggerSystemeIoSync,
  toggleAutoSync,
  saveAutoSyncTime,
} from "@/actions/integrations";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function SystemeIoForm({
  connected,
  lastSyncedAt,
  lastSyncStatus,
  lastSyncError,
  autoSyncEnabled,
  autoSyncTime,
  lang,
}: {
  connected: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  autoSyncEnabled: boolean;
  autoSyncTime: string;
  lang: Lang;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveSystemeIoApiKey, undefined);
  const [syncResult, setSyncResult] = useState<{ error?: string; success?: string } | null>(null);
  const [syncPending, startSync] = useTransition();
  const [autoSync, setAutoSync] = useState(autoSyncEnabled);
  const [autoSyncPending, startAutoSyncTransition] = useTransition();
  const [timeState, timeAction, timePending] = useActionState(saveAutoSyncTime, undefined);
  const t = getDict(lang);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-soft">
          {t.systemeio.statusLabel}{" "}
          {connected ? (
            <span className="font-medium text-emerald-700">{t.systemeio.connected}</span>
          ) : (
            <span className="font-medium text-soft">{t.systemeio.notConnected}</span>
          )}
        </p>
        {lastSyncedAt && (
          <p className="mt-1 text-xs text-soft">
            {t.systemeio.lastSynced(new Date(lastSyncedAt).toLocaleString())} ·{" "}
            {lastSyncStatus === "error" ? (
              <span className="text-red-600">{t.systemeio.failed(lastSyncError ?? "")}</span>
            ) : (
              <span className="text-emerald-700">{t.systemeio.success}</span>
            )}
          </p>
        )}
      </div>

      <form action={saveAction} className="space-y-1">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="apiKey" className="block text-xs font-semibold uppercase tracking-wide text-soft">
              {t.systemeio.apiKeyLabel}
            </label>
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              placeholder={t.systemeio.apiKeyPlaceholder}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
          </div>
          <button
            type="submit"
            disabled={savePending}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
          >
            {savePending ? t.systemeio.saving : t.systemeio.saveKey}
          </button>
        </div>
        <p className="text-xs text-soft">{t.systemeio.apiKeyHelp}</p>
      </form>
      {saveState?.error && <p className="text-sm text-red-600">{saveState.error}</p>}
      {saveState?.success && <p className="text-sm text-emerald-700">{saveState.success}</p>}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!connected || syncPending}
            onClick={() =>
              startSync(async () => {
                const result = await triggerSystemeIoSync();
                setSyncResult(result);
              })
            }
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
          >
            {syncPending ? t.systemeio.syncing : t.systemeio.syncNow}
          </button>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={autoSync}
              disabled={!connected || autoSyncPending}
              onChange={(e) => {
                const value = e.target.checked;
                setAutoSync(value);
                startAutoSyncTransition(() => toggleAutoSync(value));
              }}
              className="h-4 w-4 rounded border-card-border"
            />
            {t.systemeio.enableAutoSync}
          </label>
        </div>

        {autoSync && (
          <form action={timeAction} className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="autoSyncTime" className="block text-xs font-semibold uppercase tracking-wide text-soft">
                {t.systemeio.runTime}
              </label>
              <input
                id="autoSyncTime"
                name="autoSyncTime"
                type="time"
                defaultValue={autoSyncTime}
                className="mt-1 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
              />
            </div>
            <button
              type="submit"
              disabled={timePending}
              className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
            >
              {timePending ? t.systemeio.saving : t.systemeio.save}
            </button>
            {timeState?.error && <p className="text-sm text-red-600">{timeState.error}</p>}
            {timeState?.success && <p className="text-sm text-emerald-700">{timeState.success}</p>}
          </form>
        )}
      </div>
      {syncResult?.error && <p className="text-sm text-red-600">{syncResult.error}</p>}
      {syncResult?.success && <p className="text-sm text-emerald-700">{syncResult.success}</p>}
    </div>
  );
}
