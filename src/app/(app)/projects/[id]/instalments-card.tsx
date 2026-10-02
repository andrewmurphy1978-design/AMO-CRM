"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);

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
                    setNote(null);
                    startTransition(async () => {
                      const res = await setInstalmentPaid(row.id, projectId, e.target.checked);
                      if (res.invoiceEmail === "sent") setNote(fr ? "Facture créée et envoyée au client." : "Invoice created and sent to the client.");
                      else if (res.invoiceEmail === "failed") setNote(fr ? "Facture créée, mais le courriel n'a pas pu être envoyé — envoyez-la depuis la carte Factures." : "Invoice created, but the email couldn't be sent — send it from the Invoices card.");
                      else if (res.invoiceEmail === "no_recipient") setNote(fr ? "Facture créée; le client n'a pas de courriel." : "Invoice created; the client has no email address.");
                      router.refresh();
                    });
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
      {note && <p className="mt-2 text-xs text-soft">{note}</p>}
    </Card>
  );
}
