"use client";

import { useTransition } from "react";
import { updateInvoiceStatus } from "@/actions/invoices";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function MarkPaidButton({ invoiceId, projectId, lang }: { invoiceId: string; projectId: string; lang: Lang }) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => updateInvoiceStatus(invoiceId, projectId, "PAID"))}
      className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
    >
      {t.invoices.markPaid}
    </button>
  );
}
