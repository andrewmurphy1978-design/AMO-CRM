"use client";

import { useState, useTransition } from "react";
import { saveOpeningBalances } from "@/actions/accounting";
import { FIELD_CLASS, LABEL_CLASS } from "@/app/(app)/contacts/[id]/section-dialog";

export interface OpeningAccount {
  id: string;
  code: string;
  label: string;
  type: "ASSET" | "LIABILITY";
  sectionLabel: string;
  amount: number | null;
}

// One entity's opening balances: a date and an amount for each asset and liability account.
export default function OpeningBalances({ lang, entityId, currency, defaultDate, accounts }: { lang: "en" | "fr"; entityId: string; currency: string; defaultDate: string; accounts: OpeningAccount[] }) {
  const fr = lang === "fr";
  const [date, setDate] = useState(defaultDate);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((a) => [a.id, a.amount === null ? "" : String(a.amount)])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const balances = accounts.map((a) => ({ accountId: a.id, amount: Number((values[a.id] ?? "").replace(/\s/g, "").replace(",", ".")) || 0 }));
      const r = await saveOpeningBalances({ entityId, date, balances });
      setMsg({ ok: !r.error, text: r.error ?? r.success ?? "" });
    });

  const groups: { title: string; rows: OpeningAccount[] }[] = [];
  for (const a of accounts) {
    const key = `${a.type === "ASSET" ? (fr ? "Actifs" : "Assets") : fr ? "Passifs" : "Liabilities"} — ${a.sectionLabel}`;
    const g = groups.find((x) => x.title === key);
    if (g) g.rows.push(a);
    else groups.push({ title: key, rows: [a] });
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-soft">
        {fr
          ? `Le solde de chaque compte à la date choisie, en ${currency}. Actifs : l'argent ou la valeur détenue. Passifs : le montant dû (une carte de crédit à payer, un prêt). Une ligne vide ou à zéro n'a pas de solde d'ouverture. La contrepartie va dans le compte d'avoir d'ouverture.`
          : `Each account's balance on the chosen date, in ${currency}. Assets: the money or value held. Liabilities: the amount owed (a credit card balance, a loan). A blank or zero line has no opening balance. The other side goes to the opening-balance equity account.`}
      </p>
      <div className="max-w-xs">
        <label className={LABEL_CLASS}>{fr ? "Date des soldes d'ouverture" : "Opening balance date"}</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD_CLASS} />
      </div>
      {groups.map((g) => (
        <div key={g.title}>
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">{g.title}</p>
          <div className="divide-y divide-card-border">
            {g.rows.map((a) => (
              <div key={a.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_10rem] items-center gap-2 py-1.5">
                <span className="text-xs text-soft">{a.code}</span>
                <span className="text-sm text-ink">{a.label}</span>
                <input inputMode="decimal" value={values[a.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))} placeholder="0.00" className={`${FIELD_CLASS} mt-0 text-right`} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} onClick={save} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">{pending ? "…" : fr ? "Enregistrer les soldes d'ouverture" : "Save opening balances"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
