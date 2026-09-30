"use client";

import { useState } from "react";
import { createInvoice } from "@/actions/invoices";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { CARD_COLORS } from "@/components/section-card";
import SectionDialog from "../../contacts/[id]/section-dialog";

const FIELD_CLASS =
  "mt-1 w-full min-w-0 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

// The Invoices card's + button: a small dialog to start a draft invoice
// (number, amount, currency, due date); line items and the rest are
// edited on the invoice's own page afterwards.
export default function NewInvoiceButton({ projectId, lang }: { projectId: string; lang: Lang }) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        title={t.contactDetail.newInvoice}
        aria-label={t.contactDetail.newInvoice}
        onClick={() => setOpen(true)}
        className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20"
      >
        +
      </button>
      <SectionDialog
        open={open}
        onOpenChange={setOpen}
        title={t.contactDetail.newInvoice}
        action={createInvoice}
        labels={t.phaseDialog}
        headerColorClassName={CARD_COLORS.invoices}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="status" value="DRAFT" />
        <div>
          <label className={LABEL_CLASS}>{t.invoices.numberPlaceholder}</label>
          <input name="number" className={FIELD_CLASS} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>{t.invoices.amount}</label>
            <input name="amount" type="number" step="0.01" min="0" required className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Currency</label>
            <select name="currency" defaultValue="CAD" className={FIELD_CLASS}>
              <option value="CAD">CAD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.invoices.dueDate}</label>
          <input name="dueDate" type="date" className={FIELD_CLASS} />
        </div>
      </SectionDialog>
    </>
  );
}
