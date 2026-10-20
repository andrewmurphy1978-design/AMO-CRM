"use client";

import { useState } from "react";
import { addManualTransaction } from "@/actions/accounting";
import AccountingDialog from "../accounting-dialog";
import { FIELD_CLASS, LABEL_CLASS } from "@/app/(app)/contacts/[id]/section-dialog";

// "Add a transaction" for one that was left out of the imports; the date is limited to the month being reconciled.
export default function AddTransactionButton({ lang, accountId, periodStart, periodEnd, currency }: { lang: "en" | "fr"; accountId: string; periodStart: string; periodEnd: string; currency: string }) {
  const [open, setOpen] = useState(false);
  const fr = lang === "fr";
  const action = async (_prev: { error?: string; success?: string } | undefined, fd: FormData) =>
    addManualTransaction({
      accountId,
      date: String(fd.get("date") ?? ""),
      description: String(fd.get("description") ?? ""),
      amount: Number(String(fd.get("amount") ?? "").replace(/\s/g, "").replace(",", ".")),
      direction: fd.get("direction") === "in" ? "in" : "out",
    });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5">
        + {fr ? "Ajouter une transaction" : "Add a transaction"}
      </button>
      {open && (
        <AccountingDialog open onOpenChange={setOpen} title={fr ? "Ajouter une transaction oubliée" : "Add a missing transaction"} action={action} lang={lang} color="billing" saveLabel={fr ? "Ajouter" : "Add"}>
          <p className="text-sm text-soft">
            {fr
              ? "Pour une transaction du relevé qui manque dans les importations. Elle ira dans Transactions, à catégoriser (ou sera catégorisée si le fournisseur est mémorisé)."
              : "For a statement line that is missing from the imports. It goes to Transactions, to categorize (or is categorized if the supplier is remembered)."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Date</label>
              <input type="date" name="date" required min={periodStart} max={periodEnd} defaultValue={periodEnd} className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>{fr ? "Sens" : "Direction"}</label>
              <select name="direction" defaultValue="out" className={FIELD_CLASS}>
                <option value="out">{fr ? "Argent sorti (dépense, paiement)" : "Money out (spending, payment)"}</option>
                <option value="in">{fr ? "Argent entré (dépôt, remboursement)" : "Money in (deposit, refund)"}</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>{fr ? "Description du relevé" : "Statement description"}</label>
              <input name="description" required placeholder="MDG Finance" className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>{fr ? `Montant (${currency})` : `Amount (${currency})`}</label>
              <input name="amount" required inputMode="decimal" placeholder="0.00" className={`${FIELD_CLASS} text-right`} />
            </div>
          </div>
        </AccountingDialog>
      )}
    </>
  );
}
