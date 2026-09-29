"use client";

import { useState } from "react";

import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { CURRENCIES, PAYMENT_TERMS, PAYMENT_SCHEDULES } from "@/lib/currencies";
import { FIELD_CLASS, LABEL_CLASS } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";
import { CARD_COLORS } from "@/components/section-card";

export interface InvoiceValues {
  autoSendInvoiceReminders?: boolean | null;
  preferredCurrency?: string | null;
  paymentTerms?: string | null;
  paymentSchedule?: string | null;
  defaultDiscount?: number | null;
}

export default function InvoiceDialog({
  action,
  values,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  values: InvoiceValues;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog
      open={open}
      onOpenChange={setOpen}
      title={t.contactForm.cardInvoice}
      action={action}
      labels={t.phaseDialog}
      headerColorClassName={CARD_COLORS.billing}
    >
      <div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="autoSendInvoiceReminders" defaultChecked={values.autoSendInvoiceReminders ?? false} className="accent-amo-lime" />
          {t.contactForm.autoSendInvoiceReminders}
        </label>
        <p className="mt-1 text-xs text-soft">{t.contactForm.autoSendInvoiceRemindersHelp}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.preferredCurrency}</label>
          <select name="preferredCurrency" defaultValue={values.preferredCurrency ?? ""} className={FIELD_CLASS}>
            <option value="">—</option>
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.paymentTerms}</label>
          <select name="paymentTerms" defaultValue={values.paymentTerms ?? ""} className={FIELD_CLASS}>
            <option value="">—</option>
            {PAYMENT_TERMS.map((term) => (
              <option key={term} value={term}>
                {term}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.paymentSchedule}</label>
          <select name="paymentSchedule" defaultValue={values.paymentSchedule ?? ""} className={FIELD_CLASS}>
            <option value="">—</option>
            {PAYMENT_SCHEDULES.map((schedule) => (
              <option key={schedule} value={schedule}>
                {schedule}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.defaultDiscount}</label>
          <input type="number" name="defaultDiscount" min={0} max={100} step="0.1" defaultValue={values.defaultDiscount ?? ""} className={FIELD_CLASS} />
        </div>
      </div>
    </SectionDialog>

  </>
  );
}
