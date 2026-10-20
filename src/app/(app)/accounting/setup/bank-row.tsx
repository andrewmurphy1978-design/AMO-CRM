"use client";

import { useState, useTransition } from "react";
import { deleteBankAccount, updateBankAccount } from "@/actions/accounting";
import ActionForm, { CurrencyField, Field, inputCls } from "../action-form";

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
}

export default function BankRow({ bank, lang }: { bank: BankInfo; lang: "en" | "fr" }) {
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
            · {bank.entityName} · {bank.code} · {bank.currency} · {bank.txCount} {fr ? "transactions" : "transactions"}
            {bank.inverted ? (fr ? " · signes inversés" : " · signs inverted") : ""}
          </span>
        </span>
        <span className="flex items-center gap-3 text-xs">
          <button className="text-soft underline" onClick={() => setEditing(!editing)}>{fr ? "Modifier" : "Edit"}</button>
          {bank.txCount === 0 && (
            <button disabled={pending} className="text-red-600 underline" onClick={remove}>{fr ? "Supprimer" : "Delete"}</button>
          )}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {editing && (
        <div className="mt-2 rounded-lg border border-card-border p-3">
          <ActionForm action={updateBankAccount.bind(null, bank.id)} submitLabel={fr ? "Enregistrer" : "Save"}>
            <Field label={fr ? "Nom du compte" : "Account name"}><input name="name" defaultValue={bank.name} required className={inputCls} /></Field>
            <Field label={fr ? "Nom en français" : "French name"}><input name="nameFr" defaultValue={bank.nameFr ?? ""} className={inputCls} /></Field>
            <Field label={fr ? "Institution" : "Institution"}><input name="institution" defaultValue={bank.institution ?? ""} className={inputCls} /></Field>
            <Field label={fr ? "4 derniers chiffres" : "Last 4 digits"}><input name="last4" maxLength={4} defaultValue={bank.last4 ?? ""} className={`${inputCls} w-24`} /></Field>
            <CurrencyField label={fr ? "Devise" : "Currency"} defaultValue={bank.currency} />
            <label className="flex items-center gap-2 pb-2 text-soft"><input type="checkbox" name="invertSign" defaultChecked={bank.inverted} /> {fr ? "Inverser les signes à l'import" : "Invert signs on import"}</label>
          </ActionForm>
        </div>
      )}
    </li>
  );
}
