"use client";

import { useTransition } from "react";
import { updateProposalStatus, deleteProposal } from "@/actions/proposals";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-black/5 text-soft",
  SENT: "bg-sky-50 text-sky-700",
  ACCEPTED: "bg-[#0fa38a]/10 text-[#0fa38a]",
  DECLINED: "bg-red-50 text-red-600",
};

export default function ProposalRow({
  proposal,
  projectId,
  lang,
}: {
  proposal: { id: string; title: string; status: string; amount: number | null; currency: string };
  projectId: string;
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);

  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="flex-1 text-sm font-medium text-ink">{proposal.title}</span>
      {proposal.amount != null && (
        <span className="text-sm text-soft">
          {proposal.amount} {proposal.currency}
        </span>
      )}
      <select
        value={proposal.status}
        disabled={pending}
        onChange={(e) => startTransition(() => updateProposalStatus(proposal.id, projectId, e.target.value))}
        className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${STATUS_COLORS[proposal.status]}`}
      >
        {Object.entries(t.proposals.statuses).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(t.proposals.deleteConfirm)) return;
          startTransition(() => deleteProposal(proposal.id, projectId));
        }}
        className="text-xs text-soft hover:text-red-600"
      >
        {t.common.delete}
      </button>
    </li>
  );
}
