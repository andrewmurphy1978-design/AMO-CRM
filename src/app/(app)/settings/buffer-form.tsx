"use client";

import { useActionState, useState, useTransition } from "react";
import { saveBufferApiKey, triggerBufferSync } from "@/actions/buffer";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

interface BufferAccountStatus {
  connected: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

function AccountForm({
  provider,
  label,
  status,
  lang,
}: {
  provider: "buffer_en" | "buffer_fr";
  label: string;
  status: BufferAccountStatus;
  lang: Lang;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveBufferApiKey, undefined);
  const t = getDict(lang);

  return (
    <div>
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="mt-0.5 text-xs text-soft">
        {t.automations.statusLabel}{" "}
        {status.connected ? (
          <span className="font-medium text-emerald-700">{t.automations.connected}</span>
        ) : (
          <span className="font-medium text-soft">{t.automations.notConnected}</span>
        )}
        {status.lastSyncedAt && (
          <>
            {" · "}
            {t.automations.lastSynced(new Date(status.lastSyncedAt).toLocaleString())}
            {status.lastSyncStatus === "error" && (
              <span className="text-red-600"> — {t.automations.failed(status.lastSyncError ?? "")}</span>
            )}
          </>
        )}
      </p>
      <form action={saveAction} className="mt-2 flex gap-2">
        <input type="hidden" name="provider" value={provider} />
        <input name="apiKey" type="password" placeholder={t.automations.apiKeyPlaceholder} className={FIELD_CLASS} />
        <button
          type="submit"
          disabled={savePending}
          className="shrink-0 rounded-md border border-card-border px-3 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
        >
          {savePending ? t.automations.saving : t.automations.saveKey}
        </button>
      </form>
      {saveState?.error && <p className="mt-1 text-sm text-red-600">{saveState.error}</p>}
      {saveState?.success && <p className="mt-1 text-sm text-emerald-700">{saveState.success}</p>}
    </div>
  );
}

export default function BufferForm({
  enStatus,
  frStatus,
  lang,
}: {
  enStatus: BufferAccountStatus;
  frStatus: BufferAccountStatus;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [syncResult, setSyncResult] = useState<{ error?: string; success?: string } | null>(null);
  const [syncPending, startSync] = useTransition();

  return (
    <div className="space-y-4">
      <AccountForm provider="buffer_en" label={t.settings.bufferEnLabel} status={enStatus} lang={lang} />
      <AccountForm provider="buffer_fr" label={t.settings.bufferFrLabel} status={frStatus} lang={lang} />

      <button
        type="button"
        disabled={(!enStatus.connected && !frStatus.connected) || syncPending}
        onClick={() =>
          startSync(async () => {
            const result = await triggerBufferSync();
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
