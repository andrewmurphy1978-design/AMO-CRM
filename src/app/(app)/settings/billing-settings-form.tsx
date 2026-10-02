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
  interacEmail,
  cardPaymentUrl,
  bookingUrl,
  lang,
}: {
  chargeCanadianTax: boolean;
  gstNumber: string | null;
  qstNumber: string | null;
  interacEmail: string | null;
  cardPaymentUrl: string | null;
  bookingUrl: string | null;
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

      <div className="space-y-3 border-t border-card-border pt-3">
        <p className="text-xs text-soft">
          {lang === "fr"
            ? "Utilisés dans le courriel « Envoyer au client » d'une soumission : comment payer le 1er versement et réserver un appel."
            : "Used in a proposal's \"Send to client\" email: how to pay the 1st instalment and how to book a call."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>{lang === "fr" ? "Courriel pour virement Interac" : "Interac e-Transfer email"}</label>
            <input type="email" name="interacEmail" defaultValue={interacEmail ?? ""} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{lang === "fr" ? "Lien de paiement par carte de crédit" : "Credit card payment page link"}</label>
            <input type="url" name="cardPaymentUrl" defaultValue={cardPaymentUrl ?? ""} placeholder="https://" className={FIELD_CLASS} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>{lang === "fr" ? "Lien de la page (tunnel) pour réserver un appel" : "Booking funnel page link (to book a call)"}</label>
            <input type="url" name="bookingUrl" defaultValue={bookingUrl ?? ""} placeholder="https://" className={FIELD_CLASS} />
          </div>
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
