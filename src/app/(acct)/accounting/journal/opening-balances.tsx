"use client";

import { useState, useTransition } from "react";
import { saveOpeningBalances } from "@/actions/accounting";
import { FIELD_CLASS, LABEL_CLASS } from "@/app/(app)/contacts/[id]/section-dialog";

export interface OpeningAccount {
  id: string;
  code: string;
  label: string;
  type: "ASSET" | "LIABILITY" | "EQUITY";
  sectionLabel: string;
  amount: number | null;
}

// One entity's opening balances: a date and an amount for each asset and liability account.
export default function OpeningBalances({ lang, entityId, currency, defaultDate, accounts, withEquity }: { lang: "en" | "fr"; entityId: string; currency: string; defaultDate: string; accounts: OpeningAccount[]; withEquity: boolean }) {
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

  const num = (id: string) => Number((values[id] ?? "").replace(/\s/g, "").replace(",", ".")) || 0;
  const total = (type: OpeningAccount["type"]) => Math.round(accounts.filter((a) => a.type === type).reduce((sum, a) => sum + num(a.id), 0) * 100) / 100;
  const assetsTotal = total("ASSET");
  const liabilitiesTotal = total("LIABILITY");
  const equityTotal = total("EQUITY");
  const difference = Math.round((assetsTotal - liabilitiesTotal - equityTotal) * 100) / 100;
  const fmt = (n: number) => n.toLocaleString(fr ? "fr-CA" : "en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" });
  const groups: { title: string; rows: OpeningAccount[] }[] = [];
  for (const a of accounts) {
    const side = a.type === "ASSET" ? (fr ? "Actifs" : "Assets") : a.type === "LIABILITY" ? (fr ? "Passifs" : "Liabilities") : fr ? "Capitaux propres" : "Equity";
    const key = a.sectionLabel ? `${side} — ${a.sectionLabel}` : side;
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
                <div className="flex items-center gap-1">
                  {withEquity && a.type === "EQUITY" && Math.abs(difference) > 0.004 && (
                    <button type="button" title={fr ? "Mettre l'écart dans ce compte pour équilibrer le bilan" : "Put the difference in this account to balance the balance sheet"} onClick={() => setValues((v) => ({ ...v, [a.id]: String(Math.round((num(a.id) + difference) * 100) / 100) }))} className="shrink-0 rounded-md border border-card-border px-1.5 py-1 text-xs text-soft hover:bg-black/5">
                      {fr ? "= équilibrer" : "= balance"}
                    </button>
                  )}
                  <input inputMode="decimal" value={values[a.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))} placeholder="0.00" className={`${FIELD_CLASS} mt-0 text-right`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {withEquity && (
        <div className={`rounded-lg px-3 py-2 text-sm ${Math.abs(difference) < 0.005 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          <p>
            {fr ? "Actifs" : "Assets"} <b>{fmt(assetsTotal)}</b> − {fr ? "Passifs" : "Liabilities"} <b>{fmt(liabilitiesTotal)}</b> − {fr ? "Capitaux propres" : "Equity"} <b>{fmt(equityTotal)}</b> = <b>{fmt(difference)}</b>
          </p>
          <p className="text-xs">
            {Math.abs(difference) < 0.005
              ? fr ? "✓ Le bilan d'ouverture est équilibré." : "✓ The opening balance sheet balances."
              : fr ? "Ajustez les comptes de capitaux propres (bouton « = équilibrer ») ; sinon l'écart ira dans les bénéfices non répartis à l'enregistrement." : "Adjust the equity accounts (the “= balance” button); otherwise the difference goes to retained earnings when you save."}
          </p>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button disabled={pending} onClick={save} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">{pending ? "…" : fr ? "Enregistrer les soldes d'ouverture" : "Save opening balances"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
