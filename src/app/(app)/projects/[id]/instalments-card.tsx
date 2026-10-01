"use client";

import { useState, useTransition } from "react";
import { setInstalmentPaid } from "@/actions/proposals";
import Card from "@/components/section-card";
import type { Lang } from "@/lib/i18n/dictionaries";

export interface InstalmentRow {
  id: string;
  label: string;
  amountText: string;
  dueText: string;
  paid: boolean;
}

// The accepted proposal's payment schedule: tick an instalment once the client
// has paid it. Ticking the 1st moves the project from Proposal to Planning
// (and the contact to Client); the last one completes the project.
export default function InstalmentsCard({ projectId, rows, lang }: { projectId: string; rows: InstalmentRow[]; lang: Lang }) {
  const fr = lang === "fr";
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState<Record<string, boolean>>({});

  return (
    <Card color="invoices" title={fr ? "Versements" : "Instalments"} compact>
      <ul className="divide-y divide-card-border">
        {rows.map((row, i) => {
          const paid = local[row.id] ?? row.paid;
          return (
            <li key={row.id} className="py-2 first:pt-0">
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={paid}
                  disabled={pending}
                  onChange={(e) => {
                    setLocal((l) => ({ ...l, [row.id]: e.target.checked }));
                    startTransition(() => setInstalmentPaid(row.id, projectId, e.target.checked));
                  }}
                  className="h-4 w-4"
                />
                <span className="min-w-0 flex-1">
                  <span className={paid ? "text-soft line-through" : "text-ink"}>
                    {i + 1}. {row.label}
                  </span>
                  <span className="block text-xs text-soft">
                    {[row.amountText, row.dueText && `${fr ? "dû" : "due"} ${row.dueText}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {paid && <span className="text-xs font-semibold text-emerald-700">{fr ? "Payé" : "Paid"}</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
