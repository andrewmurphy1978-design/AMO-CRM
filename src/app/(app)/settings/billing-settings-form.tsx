"use client";

import { useActionState } from "react";
import { updateBillingSettings } from "@/actions/billing-settings";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

export default function BillingSettingsForm({
  chargeCanadianTax,
  gstNumber,
  qstNumber,
  lang,
}: {
  chargeCanadianTax: boolean;
  gstNumber: string | null;
  qstNumber: string | null;
  lang: Lang;
}) {
  const [state, formAction, pending] = useActionState(updateBillingSettings, undefined);
  const t = getDict(lang);

  return (
    <form action={formAction} className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="chargeCanadianTax" defaultChecked={chargeCanadianTax} className="accent-amo-lime" />
        {t.billingSettings.chargeCanadianTax}
      </label>
      <p className="text-xs text-soft">{t.billingSettings.chargeCanadianTaxHelp}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>{t.billingSettings.gstNumber}</label>
          <input name="gstNumber" defaultValue={gstNumber ?? ""} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.billingSettings.qstNumber}</label>
          <input name="qstNumber" defaultValue={qstNumber ?? ""} className={FIELD_CLASS} />
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.common.saving : t.common.save}
      </button>
    </form>
  );
}
