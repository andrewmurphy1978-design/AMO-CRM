import Link from "next/link";
import { requireAccountingUser } from "./session";
import Card, { type CardColor } from "@/components/section-card";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { entityCardColor, loadBooks, KIND_LABEL } from "@/lib/accounting/options";
import { periodTotals, salesTaxReport, smallSupplierStatus } from "@/lib/accounting/reports";
import { overviewRanges } from "@/lib/accounting/periods";
import { money } from "@/lib/accounting/format";

export default async function AccountingOverview() {
  const me = await requireAccountingUser();
  const lang = await getLang();
  const fr = lang === "fr";
  const now = new Date();

  const data = await withScopedPrismaClient(async (db) => {
    await ensureAccountingSetup(db, me);
    const { entities } = await loadBooks(db, me.id);
    const [toCategorize, suggested] = await Promise.all([
      db.accTransaction.count({ where: { status: "NEW", account: { entity: { ownerId: me.id } } } }),
      db.accTransaction.count({ where: { status: "SUGGESTED", account: { entity: { ownerId: me.id } } } }),
    ]);
    const cards = [];
    for (const e of entities) {
      const r = overviewRanges(e.fiscalYearEndMonth);
      const [ytd, prev, mtd] = await periodTotals(db, e.id, [r.ytd, r.prev, r.mtd]);
      const periods = [
        { key: "ytd", label: fr ? "Cumul annuel" : "Year to date", sub: `${r.ytd.from.toISOString().slice(0, 10)} →`, t: ytd },
        { key: "prev", label: fr ? "Mois précédent" : "Previous month", sub: r.prev.label, t: prev },
        { key: "mtd", label: fr ? "Mois en cours" : "Month to date", sub: r.mtd.label, t: mtd },
      ];
      const tax = e.country === "CA" && e.kind !== "PERSONAL" ? await salesTaxReport(db, e.id, r.ytd.from, r.ytd.to) : null;
      const small = e.country === "CA" && e.kind !== "PERSONAL" && !e.salesTaxRegistered ? await smallSupplierStatus(db, e.id, now) : null;
      const accounts = await db.accAccount.findMany({ where: { entityId: e.id, subtype: { in: ["BANK", "CREDIT_CARD"] }, archived: false }, select: { id: true, name: true, last4: true } });
      cards.push({ e, periods, tax, small, accounts });
    }
    return { cards, toCategorize, suggested };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span />
        <Link href="/accounting/import" className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
          {fr ? "Importer des transactions" : "Import transactions"}
        </Link>
      </div>

      {data.toCategorize + data.suggested > 0 && (
        <Link href="/accounting/transactions" className="block rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm hover:bg-amber-100">
          <b>{data.toCategorize + data.suggested}</b> {fr ? "transaction(s) à catégoriser" : "transaction(s) to categorize"}
          {data.suggested > 0 && (fr ? ` — dont ${data.suggested} avec une suggestion à confirmer.` : ` — ${data.suggested} with a suggestion to confirm.`)} →
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.cards.map(({ e, periods, tax, small, accounts }) => {
          const cur = e.currency;
          const kind = KIND_LABEL[e.kind]?.[fr ? "fr" : "en"] ?? e.kind;
          return (
            <Card key={e.id} color={entityCardColor(e) as CardColor} title={e.name}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-soft">
                    {kind} · {e.country}
                    {e.province ? `-${e.province}` : ""} · {e.basis === "CASH" ? (fr ? "base de caisse" : "cash basis") : fr ? "comptabilité d'exercice" : "accrual basis"}
                  </p>
                </div>
              </div>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-soft">
                    <th />
                    {periods.map((p) => (
                      <th key={p.key} className="pb-1 text-right font-semibold">
                        {p.label}
                        <span className="block text-[10px] font-normal normal-case">{p.sub}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  <tr>
                    <th className="py-1.5 text-left font-medium text-soft">{fr ? "Revenus" : "Income"}</th>
                    {periods.map((p) => <td key={p.key} className="text-right font-semibold text-emerald-700">{money(p.t.income, cur, lang)}</td>)}
                  </tr>
                  <tr>
                    <th className="py-1.5 text-left font-medium text-soft">{fr ? "Dépenses" : "Expenses"}</th>
                    {periods.map((p) => <td key={p.key} className="text-right font-semibold text-ink">{money(p.t.expenses, cur, lang)}</td>)}
                  </tr>
                  <tr>
                    <th className="py-1.5 text-left font-medium text-soft">{fr ? "Résultat net" : "Net"}</th>
                    {periods.map((p) => <td key={p.key} className={`text-right font-bold ${p.t.net < 0 ? "text-red-600" : "text-ink"}`}>{money(p.t.net, cur, lang)}</td>)}
                  </tr>
                </tbody>
              </table>

              {tax && e.salesTaxRegistered && (
                <div className="mt-4 rounded-lg bg-black/[0.03] p-3 text-sm">
                  <p className="font-medium text-ink">{fr ? "Taxes de vente — solde à remettre" : "Sales taxes — balance owing"}</p>
                  <p className="mt-1 text-soft">
                    {e.province === "QC" || !e.province ? "TPS/GST" : "GST/HST"}: <b className="text-ink">{money(tax.gstHst.owing, cur, lang)}</b>
                    {(e.province === "QC" || !e.province) && (
                      <>
                        {" · "}TVQ/QST: <b className="text-ink">{money(tax.qst.owing, cur, lang)}</b>
                      </>
                    )}
                  </p>
                </div>
              )}

              {small && (
                <div className="mt-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-soft">{fr ? "Seuil de petit fournisseur (4 derniers trimestres)" : "Small-supplier limit (last 4 quarters)"}</span>
                    <b className={small.exceeded ? "text-red-600" : "text-ink"}>
                      {money(small.total, cur, lang)} / {money(small.threshold, cur, lang)}
                    </b>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10">
                    <div className={`h-full ${small.pct >= 90 ? "bg-red-500" : small.pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${small.pct}%` }} />
                  </div>
                  {small.exceeded && <p className="mt-1 text-xs text-red-600">{fr ? "Seuil dépassé : inscription TPS/TVQ obligatoire." : "Limit exceeded: GST/QST registration is required."}</p>}
                </div>
              )}

              {accounts.length > 0 && (
                <p className="mt-4 text-xs text-soft">
                  {fr ? "Comptes : " : "Accounts: "}
                  {accounts.map((a) => `${a.name}${a.last4 ? ` ••${a.last4}` : ""}`).join(", ")}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-soft">
        {fr
          ? "Les références de lignes d'impôt (T2125, Annexe C) sont des guides à faire valider par votre comptable."
          : "Tax-line references (T2125, Schedule C) are guides — have your accountant confirm them."}
      </p>
    </div>
  );
}
