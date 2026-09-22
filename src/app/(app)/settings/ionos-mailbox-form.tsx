"use client";

import { useActionState } from "react";
import { saveIonosMailboxAction, testIonosMailboxAction, disconnectIonosMailboxAction } from "@/actions/integrations";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const SELECT_CLASS = FIELD_CLASS;

export default function IonosMailboxForm({
  connected,
  address,
  displayName,
  lastCheckedAt,
  lastError,
  lang,
}: {
  connected: boolean;
  address: string;
  displayName: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [saveState, saveAction, savePending] = useActionState(saveIonosMailboxAction, undefined);
  const [testState, testAction, testPending] = useActionState(testIonosMailboxAction, undefined);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-soft">{t.ionosMailbox.description}</p>
        <p className="mt-1 text-sm text-soft">
          {t.ionosMailbox.statusLabel}{" "}
          {connected ? (
            <span className="font-medium text-emerald-700">
              {t.ionosMailbox.connected} ({address})
            </span>
          ) : (
            <span className="font-medium text-soft">{t.ionosMailbox.notConnected}</span>
          )}
        </p>
        {lastCheckedAt && (
          <p className="mt-1 text-xs text-soft">
            {t.ionosMailbox.lastChecked}: {new Date(lastCheckedAt).toLocaleString(lang === "fr" ? "fr-CA" : "en-US")}
          </p>
        )}
        {lastError && <p className="mt-1 text-xs text-red-600">{t.ionosMailbox.lastError}: {lastError}</p>}
      </div>

      <form action={saveAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.ionosMailbox.addressLabel}</label>
            <input name="address" type="email" defaultValue={address} required className={FIELD_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.ionosMailbox.displayNameLabel}</label>
            <input name="displayName" defaultValue={displayName} className={FIELD_CLASS} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.ionosMailbox.imapHostLabel}</label>
            <input name="imapHost" defaultValue="imap.ionos.com" className={FIELD_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.ionosMailbox.imapPortLabel}</label>
            <input name="imapPort" type="number" defaultValue={993} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.ionosMailbox.securityLabel}</label>
            <select name="imapSecurity" defaultValue="tls" className={SELECT_CLASS}>
              <option value="tls">TLS</option>
              <option value="starttls">STARTTLS</option>
              <option value="plain">{t.ionosMailbox.securityNone}</option>
            </select>
          </div>
          <div className="hidden sm:block" />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.ionosMailbox.smtpHostLabel}</label>
            <input name="smtpHost" defaultValue="smtp.ionos.com" className={FIELD_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.ionosMailbox.smtpPortLabel}</label>
            <input name="smtpPort" type="number" defaultValue={465} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.ionosMailbox.securityLabel}</label>
            <select name="smtpSecurity" defaultValue="tls" className={SELECT_CLASS}>
              <option value="tls">TLS</option>
              <option value="starttls">STARTTLS</option>
              <option value="plain">{t.ionosMailbox.securityNone}</option>
            </select>
          </div>
          <div className="hidden sm:block" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.ionosMailbox.usernameLabel}</label>
            <input name="username" defaultValue={address} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.ionosMailbox.passwordLabel}</label>
            <input name="password" type="password" placeholder={connected ? t.ionosMailbox.passwordKeepBlank : ""} className={FIELD_CLASS} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={savePending}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
          >
            {savePending ? t.ionosMailbox.saving : t.ionosMailbox.save}
          </button>
          <button
            type="submit"
            formAction={testAction}
            disabled={testPending}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
          >
            {testPending ? t.ionosMailbox.testing : t.ionosMailbox.test}
          </button>
          {connected && (
            <button
              type="button"
              onClick={() => disconnectIonosMailboxAction()}
              className="rounded-md border border-card-border px-4 py-2 text-sm text-soft hover:bg-black/5"
            >
              {t.ionosMailbox.disconnect}
            </button>
          )}
        </div>
      </form>
      {saveState?.error && <p className="text-sm text-red-600">{saveState.error}</p>}
      {saveState?.success && <p className="text-sm text-emerald-700">{saveState.success}</p>}
      {testState?.error && <p className="text-sm text-red-600">{testState.error}</p>}
      {testState?.success && <p className="text-sm text-emerald-700">{testState.success}</p>}
    </div>
  );
}
