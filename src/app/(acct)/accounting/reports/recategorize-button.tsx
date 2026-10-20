"use client";

import { useEffect, useState } from "react";
import { countSimilarTransactions, recategorizeTransaction } from "@/actions/accounting";
import AccountingDialog from "../accounting-dialog";
import { FIELD_CLASS, LABEL_CLASS } from "@/app/(app)/contacts/[id]/section-dialog";
import { GROUP_LABEL, type AccountOption, type EntityInfo } from "@/lib/accounting/options";
import { money } from "@/lib/accounting/format";

export interface RecatTx {
  id: string;
  supplier: string;
  date: string;
  amount: number;
  accountId: string;
}

// "Recategorize" on a General Ledger line that comes from an imported transaction.
export default function RecategorizeButton({ lang, tx, entities, options, currency }: { lang: "en" | "fr"; tx: RecatTx; entities: EntityInfo[]; options: AccountOption[]; currency: string }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [similar, setSimilar] = useState<{ count: number; locked: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    countSimilarTransactions(tx.id).then((r) => alive && setSimilar(r)).catch(() => alive && setSimilar(null));
    return () => {
      alive = false;
    };
  }, [open, tx.id]);
  const fr = lang === "fr";
  const action = async (_prev: { error?: string; success?: string } | undefined, fd: FormData) => {
    const [entityId, accountId] = String(fd.get("pick") ?? "").split("|");
    if (!entityId || !accountId) return { error: fr ? "Choisissez une catégorie." : "Choose a category." };
    return recategorizeTransaction({ txId: tx.id, entityId, accountId, tax: fd.get("tax") === "on", remember: fd.get("remember") === "on", applyToSimilar: fd.get("similar") === "on" });
  };
  const chosenEntity = entities.find((e) => e.id === pick.split("|")[0]);
  return (
    <>
      <button type="button" className="text-xs text-soft underline" onClick={() => setOpen(true)}>{fr ? "Recatégoriser" : "Recategorize"}</button>
      {open && (
        <AccountingDialog open onOpenChange={setOpen} title={fr ? "Recatégoriser la transaction" : "Recategorize the transaction"} action={action} lang={lang} color="statistics">
          <p className="text-sm text-ink">
            <b>{tx.supplier}</b> · {tx.date} · {money(tx.amount, currency, lang)}
          </p>
          <div>
            <label className={LABEL_CLASS}>{fr ? "Nouvelle catégorie" : "New category"}</label>
            <select name="pick" value={pick} onChange={(e) => setPick(e.target.value)} className={FIELD_CLASS}>
              <option value="">{fr ? "— Choisir une catégorie —" : "— Choose a category —"}</option>
              {entities.map((e) =>
                (["EXPENSE", "INCOME", "TRANSFER", "LIABILITY", "ASSET", "EQUITY"] as const).map((g) => {
                  const list = options.filter((o) => o.entityId === e.id && o.group === g && !o.isGroup && o.id !== tx.accountId);
                  if (list.length === 0) return null;
                  return (
                    <optgroup key={`${e.id}${g}`} label={`${e.name} — ${GROUP_LABEL[g][lang]}`}>
                      {list.map((o) => <option key={o.id} value={`${e.id}|${o.id}`}>{o.code} {fr ? o.labelFr : o.label}</option>)}
                    </optgroup>
                  );
                })
              )}
            </select>
          </div>
          {chosenEntity?.salesTaxRegistered && (
            <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="tax" className="accent-amo-lime" /> {fr ? "Taxes de vente incluses dans le montant" : "Sales tax included in the amount"}</label>
          )}
          {similar && similar.count > 0 && (
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" name="similar" defaultChecked className="mt-0.5 accent-amo-lime" />
              <span>
                {fr ? `Appliquer aussi aux ${similar.count} autres transactions de « ${tx.supplier} » déjà catégorisées` : `Also move the ${similar.count} other already-categorized transactions from “${tx.supplier}”`}
                {similar.locked > 0 && <span className="block text-xs text-soft">{fr ? `${similar.locked} dans un mois verrouillé ne seront pas touchées.` : `${similar.locked} in a locked month will be left alone.`}</span>}
              </span>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="remember" defaultChecked className="accent-amo-lime" /> {fr ? "Mémoriser cette catégorie pour ce fournisseur" : "Remember this category for this supplier"}</label>
        </AccountingDialog>
      )}
    </>
  );
}
