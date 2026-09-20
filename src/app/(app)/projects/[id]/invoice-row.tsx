"use client";

import Link from "next/link";
import { useTransition } from "react";
import { updateInvoiceStatus, deleteInvoice } from "@/actions/invoices";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-black/5 text-soft",
  SENT: "bg-sky-50 text-sky-700",
  PAID: "bg-[#0fa38a]/10 text-[#0fa38a]",
  OVERDUE: "bg-amber-50 text-amber-700",
  CANCELED: "bg-red-50 text-red-600",
};

export default function InvoiceRow({
  invoice,
  projectId,
  lang,
}: {
  invoice: {
    id: string;
    number: string | null;
    status: string;
    amount: number;
    currency: string;
    dueDate: Date | null;
  };
  projectId: string;
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);

  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <Link href={`/projects/${projectId}/invoices/${invoice.id}`} className="flex-1 text-sm font-medium text-ink hover:underline">
        {invoice.number || "—"}
      </Link>
      <span className="text-sm text-soft">
        {invoice.amount} {invoice.currency}
      </span>
      {invoice.dueDate && (
        <span className="text-xs text-soft">
          {t.invoices.dueDate}: {new Date(invoice.dueDate).toLocaleDateString()}
        </span>
      )}
      <select
        value={invoice.status}
        disabled={pending}
        onChange={(e) => startTransition(() => updateInvoiceStatus(invoice.id, projectId, e.target.value))}
        className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${STATUS_COLORS[invoice.status]}`}
      >
        {Object.entries(t.invoices.statuses).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(t.invoices.deleteConfirm)) return;
          startTransition(() => deleteInvoice(invoice.id, projectId));
        }}
        className="text-xs text-soft hover:text-red-600"
      >
        {t.common.delete}
      </button>
    </li>
  );
}
