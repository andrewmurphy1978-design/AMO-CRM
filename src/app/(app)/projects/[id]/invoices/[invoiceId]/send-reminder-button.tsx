"use client";

import { useTransition } from "react";
import { markInvoiceReminderSent } from "@/actions/invoices";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function SendReminderButton({
  invoiceId,
  mailtoHref,
  lang,
}: {
  invoiceId: string;
  mailtoHref: string;
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);

  return (
    <a
      href={mailtoHref}
      onClick={() => startTransition(() => markInvoiceReminderSent(invoiceId))}
      className={`btn-primary inline-block rounded-lg px-4 py-2 text-sm font-semibold shadow-sm ${pending ? "opacity-60" : ""}`}
    >
      {t.invoices.sendReminderNow}
    </a>
  );
}
