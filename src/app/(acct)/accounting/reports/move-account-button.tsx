"use client";

import { useState } from "react";
import { moveAccountTransactions } from "@/actions/accounting";
import AccountingDialog from "../accounting-dialog";
import { FIELD_CLASS, LABEL_CLASS } from "@/app/(app)/contacts/[id]/section-dialog";
import type { AccountOption } from "@/lib/accounting/options";

// "Move all transactions to another account": every line of this account goes to the chosen account of the same entity.
export default function MoveAccountButton({ lang, from, options }: { lang: "en" | "fr"; from: AccountOption; options: AccountOption[] }) {
  const [open, setOpen] = useState(false);
  const fr = lang === "fr";
  const targets = options.filter((o) => o.entityId === from.entityId && o.id !== from.id && !o.isGroup && !o.bank);
  const action = async (_prev: { error?: string; success?: string } | undefined, fd: FormData) => {
    const toId = String(fd.get("toId") ?? "");
    if (!toId) return { error: fr ? "Choisissez le compte de destination." : "Choose the destination account." };
    return moveAccountTransactions({ fromId: from.id, toId, updateRules: fd.get("rules") === "on" });
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5">
        {fr ? "Déplacer toutes les transactions vers un autre compte…" : "Move all transactions to another account…"}
      </button>
      {open && (
        <AccountingDialog open onOpenChange={setOpen} title={fr ? "Déplacer les transactions" : "Move the transactions"} action={action} lang={lang} color="statistics" saveLabel={fr ? "Déplacer" : "Move"}>
          <p className="text-sm text-ink">
            {fr ? "Toutes les écritures du compte " : "Every entry of account "}<b>{from.code} {fr ? from.labelFr : from.label}</b>{fr ? " seront déplacées vers le compte choisi (même entité)." : " will be moved to the account you choose (same entity)."}
          </p>
          <div>
            <label className={LABEL_CLASS}>{fr ? "Compte de destination" : "Destination account"}</label>
            <select name="toId" defaultValue="" className={FIELD_CLASS}>
              <option value="">{fr ? "— Choisir un compte —" : "— Choose an account —"}</option>
              {targets.map((o) => <option key={o.id} value={o.id}>{o.code} {fr ? o.labelFr : o.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="rules" defaultChecked className="accent-amo-lime" /> {fr ? "Mettre à jour aussi les fournisseurs mémorisés qui utilisaient l'ancien compte" : "Also update remembered suppliers that used the old account"}</label>
          <p className="text-xs text-soft">{fr ? "Le compte d'origine reste, vide : vous pouvez ensuite le retirer du plan comptable." : "The original account stays, now empty: you can then remove it from the chart of accounts."}</p>
        </AccountingDialog>
      )}
    </>
  );
}
