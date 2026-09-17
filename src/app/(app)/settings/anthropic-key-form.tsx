"use client";

import { useActionState } from "react";
import { saveAnthropicApiKey } from "@/actions/integrations";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function AnthropicKeyForm({ connected, lang }: { connected: boolean; lang: Lang }) {
  const [saveState, saveAction, savePending] = useActionState(saveAnthropicApiKey, undefined);
  const t = getDict(lang);

  return (
    <div className="space-y-3">
      <p className="text-sm text-soft">
        {t.anthropicKey.statusLabel}{" "}
        {connected ? (
          <span className="font-medium text-emerald-700">{t.anthropicKey.connected}</span>
        ) : (
          <span className="font-medium text-soft">{t.anthropicKey.notConnected}</span>
        )}
      </p>

      <form action={saveAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="anthropicApiKey" className="block text-xs font-semibold uppercase tracking-wide text-soft">
            {t.anthropicKey.apiKeyLabel}
          </label>
          <input
            id="anthropicApiKey"
            name="apiKey"
            type="password"
            placeholder={t.anthropicKey.apiKeyPlaceholder}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
        </div>
        <button
          type="submit"
          disabled={savePending}
          className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
        >
          {savePending ? t.anthropicKey.saving : t.anthropicKey.saveKey}
        </button>
      </form>
      {saveState?.error && <p className="text-sm text-red-600">{saveState.error}</p>}
      {saveState?.success && <p className="text-sm text-emerald-700">{saveState.success}</p>}
    </div>
  );
}
