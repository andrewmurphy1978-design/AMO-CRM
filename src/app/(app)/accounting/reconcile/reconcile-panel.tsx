"use client";

import { useState, useTransition } from "react";
import { reconcileMonth, setOpeningBalance } from "@/actions/accounting";
import { differenceHints, type ReconcileSummary } from "@/lib/accounting/reconcile";
import { money } from "@/lib/accounting/format";

export default function ReconcilePanel({ lang, month, summary: s }: { lang: "en" | "fr"; month: string; summary: ReconcileSummary }) {
  const fr = lang === "fr";
  const [input, setInput] = useState(s.reconciled ? String(s.reconciled.statementBalance) : "");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openingDate, setOpeningDate] = useState(s.firstTxDate ? new Date(Date.parse(s.firstTxDate) - 86400000).toISOString().slice(0, 10) : s.periodStart);
  const [pending, start] = useTransition();
  const m = (n: number) => money(n, s.currency, lang);

  const typed = input.trim() === "" ? null : Number(input.replace(",", "."));
  const valid = typed !== null && Number.isFinite(typed);
  const difference = valid ? Math.round((typed - s.computed) * 100) / 100 : null;
  const balanced = difference !== null && Math.abs(difference) < 0.005;
  const locked = s.lockedThrough !== null && s.lockedThrough >= s.periodEnd;
  const hints = difference !== null && !balanced ? differenceHints(s.txs, difference, s.isCard, lang) : [];
  const cls = "rounded-lg border border-card-border bg-white px-2 py-1.5 text-sm text-ink";

  return (
    <section className="space-y-4 rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          {fr ? "Rapprochement" : "Reconciliation"} — {s.periodStart} → {s.periodEnd}
        </h2>
        {locked && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">🔒 {s.reconciled ? (fr ? "Rapproché et verrouillé" : "Reconciled and locked") : fr ? `Verrouillé jusqu'au ${s.lockedThrough}` : `Locked through ${s.lockedThrough}`}</span>}
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs uppercase text-soft">{fr ? "Solde d'ouverture" : "Opening balance"}</dt><dd className="font-semibold text-ink">{m(s.opening)}</dd></div>
        <div><dt className="text-xs uppercase text-soft">{s.isCard ? (fr ? "Paiements et crédits" : "Payments & credits") : fr ? "Entrées" : "Money in"}</dt><dd className="font-semibold text-emerald-700">{m(s.moneyIn)}</dd></div>
        <div><dt className="text-xs uppercase text-soft">{s.isCard ? (fr ? "Achats" : "Purchases") : fr ? "Sorties" : "Money out"}</dt><dd className="font-semibold text-ink">{m(s.moneyOut)}</dd></div>
        <div><dt className="text-xs uppercase text-soft">{s.isCard ? (fr ? "Solde dû calculé" : "Computed balance owed") : fr ? "Solde calculé (CRM)" : "Computed balance (CRM)"}</dt><dd className="font-semibold text-ink">{m(s.computed)}</dd></div>
      </dl>

      {s.uncategorized > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {fr ? `${s.uncategorized} transaction(s) de ce mois ne sont pas encore catégorisées. Le rapprochement fonctionne quand même, mais catégorisez-les avant de clore le mois.` : `${s.uncategorized} transaction(s) this month are not categorized yet. You can still reconcile, but categorize them before closing the month.`}
        </p>
      )}

      {!locked && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-soft">{s.isCard ? (fr ? "Solde dû sur le relevé" : "Balance owed on the statement") : fr ? "Solde de clôture du relevé" : "Statement closing balance"} ({s.currency})</span>
              <input value={input} onChange={(e) => setInput(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${cls} w-44`} />
            </label>
            <label className="flex min-w-48 flex-1 flex-col gap-1">
              <span className="text-xs text-soft">{fr ? "Note (facultatif)" : "Note (optional)"}</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={cls} />
            </label>
            <button
              disabled={pending || !balanced}
              onClick={() => start(async () => { const r = await reconcileMonth({ accountId: s.accountId, month, statementBalance: typed as number, notes }); setMsg({ ok: !r.error, text: r.error ?? r.success ?? "" }); })}
              className="btn-primary rounded-lg px-4 py-1.5 font-semibold disabled:opacity-50"
            >
              {fr ? "Rapprocher et verrouiller le mois" : "Reconcile & lock month"}
            </button>
          </div>
          {difference !== null && (
            <p className={`text-sm font-semibold ${balanced ? "text-emerald-700" : "text-red-600"}`}>
              {balanced ? (fr ? "✓ Les soldes correspondent." : "✓ The balances match.") : `${fr ? "Écart :" : "Difference:"} ${m(difference)}`}
            </p>
          )}
          {hints.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-soft">
              {hints.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}
          {!s.hasOpeningEntry && difference !== null && !balanced && !s.lockedThrough && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-card-border bg-field-bg/40 p-3 text-sm">
              <p className="w-full text-xs text-soft">
                {fr
                  ? "Ce compte n'a pas de solde d'ouverture. Si l'écart vient du solde avant votre première transaction, enregistrez-le : le CRM le déduit du relevé."
                  : "This account has no opening balance. If the difference is the balance before your first transaction, record it: the CRM derives it from this statement."}
              </p>
              <label className="flex flex-col gap-1"><span className="text-xs text-soft">{fr ? "À la date" : "As of"}</span><input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} className={cls} /></label>
              <button
                disabled={pending}
                onClick={() => start(async () => { const r = await setOpeningBalance({ accountId: s.accountId, date: openingDate, amount: s.opening + (difference as number) }); setMsg({ ok: !r.error, text: r.error ?? r.success ?? "" }); })}
                className="rounded-lg border border-card-border px-3 py-1.5 font-medium text-ink hover:bg-black/5 disabled:opacity-50"
              >
                {fr ? `Enregistrer un solde d'ouverture de ${m(s.opening + (difference as number))}` : `Record an opening balance of ${m(s.opening + (difference as number))}`}
              </button>
            </div>
          )}
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
        </div>
      )}

      <details open={!locked}>
        <summary className="cursor-pointer text-sm font-medium text-ink">{fr ? `Transactions du mois (${s.txs.length})` : `This month's transactions (${s.txs.length})`}</summary>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-card-border">
            {s.txs.map((t) => (
              <tr key={t.id}>
                <td className="py-1 pr-3 whitespace-nowrap text-soft">{t.date}</td>
                <td className="pr-3 text-ink">{t.supplier}<span className="block text-xs text-soft">{t.description}</span></td>
                <td className="pr-3 text-xs text-soft">{t.status === "POSTED" ? "✓" : t.status === "IGNORED" ? (fr ? "ignorée" : "ignored") : fr ? "à catégoriser" : "to categorize"}</td>
                <td className={`text-right whitespace-nowrap ${t.amount < 0 ? "text-ink" : "text-emerald-700"}`}>{m(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
