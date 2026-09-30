"use client";

import { useActionState, useTransition } from "react";
import { saveTwilioSettings, disconnectTwilio } from "@/actions/integrations";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

export default function TwilioForm({
  connected,
  accountSid,
  fromNumber,
  baseUrl,
  lang,
}: {
  connected: boolean;
  accountSid: string;
  fromNumber: string;
  baseUrl: string;
  lang: Lang;
}) {
  const [state, action, pending] = useActionState(saveTwilioSettings, undefined);
  const [disconnecting, startDisconnect] = useTransition();
  const t = getDict(lang);

  return (
    <div className="space-y-3">
      <p className="text-sm text-soft">
        {t.twilioSettings.statusLabel}{" "}
        {connected ? (
          <span className="font-medium text-emerald-700">{t.twilioSettings.connected}</span>
        ) : (
          <span className="font-medium text-soft">{t.twilioSettings.notConnected}</span>
        )}
      </p>

      <form action={action} className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL_CLASS}>{t.twilioSettings.accountSid}</label>
          <input name="accountSid" defaultValue={accountSid} placeholder="AC..." autoComplete="off" className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.twilioSettings.authToken}</label>
          <input name="authToken" type="password" autoComplete="new-password" placeholder={connected ? t.twilioSettings.authTokenKeep : ""} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.twilioSettings.fromNumber}</label>
          <input name="fromNumber" defaultValue={fromNumber} placeholder="+18195551234" className={FIELD_CLASS} />
        </div>
        <div className="flex items-center gap-3 sm:col-span-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
          >
            {pending ? t.twilioSettings.saving : t.twilioSettings.save}
          </button>
          {connected && (
            <button
              type="button"
              disabled={disconnecting}
              onClick={() => startDisconnect(() => disconnectTwilio())}
              className="text-sm text-soft hover:text-red-600 hover:underline disabled:opacity-60"
            >
              {t.twilioSettings.disconnect}
            </button>
          )}
        </div>
      </form>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      <div className="space-y-2 rounded-lg border border-card-border bg-black/[0.02] p-3">
        <p className={LABEL_CLASS}>{t.twilioSettings.webhooksTitle}</p>
        <p className="text-xs text-soft">{t.twilioSettings.webhooksHelp}</p>
        {[
          [t.twilioSettings.incomingUrl, `${baseUrl}/api/twilio/sms`],
          [t.twilioSettings.statusUrl, `${baseUrl}/api/twilio/status`],
        ].map(([label, url]) => (
          <p key={url} className="text-xs text-soft">
            <span className="font-semibold uppercase tracking-wide text-ink">{label}:</span>{" "}
            <code className="break-all rounded bg-field-bg px-1.5 py-0.5 text-ink">{url}</code>
          </p>
        ))}
      </div>
    </div>
  );
}
