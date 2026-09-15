"use client";

import { useActionState, useState, useTransition } from "react";
import { saveSystemeIoApiKey, triggerSystemeIoSync, toggleAutoSync } from "@/actions/integrations";

export default function SystemeIoForm({
  connected,
  lastSyncedAt,
  lastSyncStatus,
  lastSyncError,
  autoSyncEnabled,
}: {
  connected: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  autoSyncEnabled: boolean;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveSystemeIoApiKey, undefined);
  const [syncResult, setSyncResult] = useState<{ error?: string; success?: string } | null>(null);
  const [syncPending, startSync] = useTransition();
  const [autoSync, setAutoSync] = useState(autoSyncEnabled);
  const [autoSyncPending, startAutoSyncTransition] = useTransition();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-amo-muted">
          Status:{" "}
          {connected ? (
            <span className="font-medium text-amo-lime">Connected</span>
          ) : (
            <span className="font-medium text-amo-muted">Not connected</span>
          )}
        </p>
        {lastSyncedAt && (
          <p className="mt-1 text-xs text-amo-muted">
            Last synced {new Date(lastSyncedAt).toLocaleString()} ·{" "}
            {lastSyncStatus === "error" ? (
              <span className="text-red-400">failed: {lastSyncError}</span>
            ) : (
              <span className="text-amo-lime">success</span>
            )}
          </p>
        )}
      </div>

      <form action={saveAction} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="apiKey" className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">
            systeme.io API key
          </label>
          <input
            id="apiKey"
            name="apiKey"
            type="password"
            placeholder="Paste your public API key"
            className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
          />
          <p className="mt-1 text-xs text-amo-muted">
            Find this under your systeme.io dashboard → Settings → Public API key.
          </p>
        </div>
        <button
          type="submit"
          disabled={savePending}
          className="rounded-md border border-amo-border px-4 py-2 text-sm font-medium text-amo-white hover:bg-white/10 disabled:opacity-60"
        >
          {savePending ? "Saving..." : "Save key"}
        </button>
      </form>
      {saveState?.error && <p className="text-sm text-red-400">{saveState.error}</p>}
      {saveState?.success && <p className="text-sm text-amo-lime">{saveState.success}</p>}

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
          className="rounded-lg bg-gradient-to-r from-amo-lime to-amo-teal px-4 py-2 text-sm font-semibold text-amo-green shadow-[0_4px_14px_rgba(46,204,113,0.25)] transition-transform hover:scale-[1.02] disabled:opacity-60"
        >
          {syncPending ? "Syncing..." : "Sync now"}
        </button>

        <label className="flex items-center gap-2 text-sm text-amo-white">
          <input
            type="checkbox"
            checked={autoSync}
            disabled={!connected || autoSyncPending}
            onChange={(e) => {
              const value = e.target.checked;
              setAutoSync(value);
              startAutoSyncTransition(() => toggleAutoSync(value));
            }}
            className="h-4 w-4 rounded border-amo-border"
          />
          Enable scheduled auto-sync (requires a cron trigger — see README)
        </label>
      </div>
      {syncResult?.error && <p className="text-sm text-red-400">{syncResult.error}</p>}
      {syncResult?.success && <p className="text-sm text-amo-lime">{syncResult.success}</p>}
    </div>
  );
}
