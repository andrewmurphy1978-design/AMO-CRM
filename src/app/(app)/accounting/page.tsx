import Link from "next/link";
import Card from "@/components/section-card";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { loadBooks, KIND_LABEL } from "@/lib/accounting/options";
import { fiscalYearRange, incomeStatement, salesTaxReport, smallSupplierStatus } from "@/lib/accounting/reports";
import { money } from "@/lib/accounting/format";

export default async function AccountingOverview({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  const lang = await getLang();
  const fr = lang === "fr";
  const now = new Date();
  const year = Number(yearParam) || now.getUTCFullYear();

  const data = await withScopedPrismaClient(async (db) => {
    await ensureAccountingSetup(db);
    const { entities } = await loadBooks(db);
    const [toCategorize, suggested] = await Promise.all([
      db.accTransaction.count({ where: { status: "NEW" } }),
      db.accTransaction.count({ where: { status: "SUGGESTED" } }),
    ]);
    const cards = [];
    for (const e of entities) {
      const range = fiscalYearRange(e.fiscalYearEndMonth, year);
      const stmt = await incomeStatement(db, e.id, range.from, range.to);
      const tax = e.country === "CA" && e.kind !== "PERSONAL" ? await salesTaxReport(db, e.id, range.from, range.to) : null;
      const small = e.country === "CA" && e.kind !== "PERSONAL" && !e.salesTaxRegistered ? await smallSupplierStatus(db, e.id, now) : null;
      const accounts = await db.accAccount.findMany({ where: { entityId: e.id, subtype: { in: ["BANK", "CREDIT_CARD"] }, archived: false }, select: { id: true, name: true, last4: true } });
      cards.push({ e, stmt, tax, small, accounts });
    }
    return { cards, toCategorize, suggested };
  });

  const years = [year + 1, year, year - 1, year - 2];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-soft">{fr ? "Année :" : "Year:"}</span>
          {years.map((y) => (
            <Link key={y} href={`/accounting?year=${y}`} className={y === year ? "btn-primary rounded-lg px-3 py-1 font-semibold" : "rounded-lg border border-card-border px-3 py-1 text-ink hover:bg-black/5"}>
              {y}
            </Link>
          ))}
        </div>
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
        {data.cards.map(({ e, stmt, tax, small, accounts }) => {
          const cur = e.currency;
          const kind = KIND_LABEL[e.kind]?.[fr ? "fr" : "en"] ?? e.kind;
          return (
            <Card key={e.id} color={e.kind === "PERSONAL" ? "personal" : e.kind === "SOLE_PROPRIETORSHIP" ? "general" : e.kind === "CORPORATION" ? "contact" : "addresses"} title={e.name}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-soft">
                    {kind} · {e.country}
                    {e.province ? `-${e.province}` : ""} · {e.basis === "CASH" ? (fr ? "base de caisse" : "cash basis") : fr ? "comptabilité d'exercice" : "accrual basis"}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase text-soft">{fr ? "Revenus" : "Income"}</dt>
                  <dd className="font-semibold text-emerald-700">{money(stmt.totalIncome, cur, lang)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-soft">{fr ? "Dépenses" : "Expenses"}</dt>
                  <dd className="font-semibold text-ink">{money(stmt.totalCogs + stmt.totalExpenses, cur, lang)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-soft">{fr ? "Résultat net" : "Net"}</dt>
                  <dd className={`font-semibold ${stmt.netIncome < 0 ? "text-red-600" : "text-ink"}`}>{money(stmt.netIncome, cur, lang)}</dd>
                </div>
              </dl>

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
