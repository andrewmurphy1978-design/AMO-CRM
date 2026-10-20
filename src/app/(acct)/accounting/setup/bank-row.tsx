"use client";

import { useState, useTransition } from "react";
import { deleteBankAccount, updateBankAccount } from "@/actions/accounting";
import AccountingDialog from "../accounting-dialog";
import { BankFields } from "./dialog-forms";
import type { CardColor } from "@/components/section-card";

export interface BankInfo {
  id: string;
  name: string;
  nameFr: string | null;
  institution: string | null;
  last4: string | null;
  inverted: boolean;
  card: boolean;
  entityName: string;
  code: string;
  txCount: number;
  currency: string;
  registeredLabel?: string;
}

export default function BankRow({ bank, lang, color }: { bank: BankInfo; lang: "en" | "fr"; color: CardColor }) {
  const fr = lang === "fr";
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(fr ? "Supprimer ce compte ?" : "Delete this account?")) return;
    start(async () => setError((await deleteBankAccount(bank.id)).error ?? null));
  };
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink">
          {fr && bank.nameFr ? bank.nameFr : bank.name}
          {bank.last4 ? ` ••${bank.last4}` : ""}{" "}
          <span className="text-soft">
            · {bank.entityName} · {bank.code} · {bank.registeredLabel ? `${bank.registeredLabel} · ` : ""}{bank.currency} · {bank.txCount} {fr ? "transactions" : "transactions"}
            {bank.inverted ? (fr ? " · signes inversés" : " · signs inverted") : ""}
          </span>
        </span>
        <span className="flex items-center gap-3 text-xs">
          <button className="text-soft underline" onClick={() => setEditing(true)}>{fr ? "Modifier" : "Edit"}</button>
          {bank.txCount === 0 && (
            <button disabled={pending} className="text-red-600 underline" onClick={remove}>{fr ? "Supprimer" : "Delete"}</button>
          )}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {editing && (
        <AccountingDialog open onOpenChange={setEditing} title={fr && bank.nameFr ? bank.nameFr : bank.name} action={updateBankAccount.bind(null, bank.id)} lang={lang} color={color}>
          <BankFields lang={lang} bank={bank} />
        </AccountingDialog>
      )}
    </li>
  );
}
