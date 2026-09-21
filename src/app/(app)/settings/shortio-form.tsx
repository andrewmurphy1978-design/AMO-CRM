"use client";

import { useActionState } from "react";
import { saveShortIoApiKey } from "@/actions/integrations";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

export default function ShortIoForm({
  connected,
  domain,
  domainFr,
  lang,
}: {
  connected: boolean;
  domain: string;
  domainFr: string;
  lang: Lang;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveShortIoApiKey, undefined);
  const t = getDict(lang);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-soft">{t.shortio.subtitle}</p>
        <p className="mt-1 text-sm text-soft">
          {t.shortio.statusLabel}{" "}
          {connected ? (
            <span className="font-medium text-emerald-700">{t.shortio.connected}</span>
          ) : (
            <span className="font-medium text-soft">{t.shortio.notConnected}</span>
          )}
        </p>
      </div>

      <form action={saveAction} className="space-y-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.shortio.apiKeyLabel}</label>
            <input name="apiKey" type="password" placeholder={t.shortio.apiKeyPlaceholder} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.shortio.domainLabel}</label>
            <input name="domain" defaultValue={domain} placeholder={t.shortio.domainPlaceholder} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.shortio.domainFrLabel}</label>
            <input name="domainFr" defaultValue={domainFr} placeholder={t.shortio.domainFrPlaceholder} className={FIELD_CLASS} />
          </div>
        </div>
        <button
          type="submit"
          disabled={savePending}
          className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
        >
          {savePending ? t.shortio.saving : t.shortio.saveKey}
        </button>
      </form>
      {saveState?.error && <p className="text-sm text-red-600">{saveState.error}</p>}
      {saveState?.success && <p className="text-sm text-emerald-700">{saveState.success}</p>}
    </div>
  );
}
