"use client";

import { useTransition } from "react";
import { convertProposalToInvoice } from "@/actions/invoices";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function ConvertToInvoiceButton({
  proposalId,
  projectId,
  lang,
}: {
  proposalId: string;
  projectId: string;
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => convertProposalToInvoice(proposalId, projectId))}
      className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
    >
      {t.proposals.convertToInvoice}
    </button>
  );
}
