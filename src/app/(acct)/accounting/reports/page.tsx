import { Fragment, type ReactNode } from "react";
import { requireAccountingUser } from "../session";
import Card from "@/components/section-card";
import Link from "next/link";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { loadBooks } from "@/lib/accounting/options";
import { ASSET_SECTIONS, LIABILITY_SECTIONS } from "@/lib/accounting/charts";
import { balanceSheet, fiscalYearRange, generalLedger, incomeStatement, salesTaxReport, taxSummary, trialBalance, type AccountRow } from "@/lib/accounting/reports";
import RecategorizeButton, { type RecatTx } from "./recategorize-button";
import { isoDate, money } from "@/lib/accounting/format";

type Sp = { entity?: string; year?: string; r?: string; account?: string; month?: string; from?: string; to?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const me = await requireAccountingUser();
  const sp = await searchParams;
  const lang = await getLang();
  const fr = lang === "fr";
  const report = sp.r ?? "is";
  const year = Number(sp.year) || new Date().getUTCFullYear();

  const out = await withScopedPrismaClient(async (db) => {
    await ensureAccountingSetup(db, me);
    const { entities, options } = await loadBooks(db, me.id);
    const entity = entities.find((e) => e.id === sp.entity) ?? entities[0];
    // The period: a date interval, a single month, or the fiscal year (the default).
    const interval = DATE_RE.test(sp.from ?? "") && DATE_RE.test(sp.to ?? "") && (sp.from as string) <= (sp.to as string);
    const monthly = !interval && MONTH_RE.test(sp.month ?? "");
    const range = interval
      ? { from: new Date(`${sp.from}T00:00:00.000Z`), to: new Date(`${sp.to}T00:00:00.000Z`) }
      : monthly
        ? (() => {
            const [y, mo] = (sp.month as string).split("-").map(Number);
            return { from: new Date(Date.UTC(y, mo - 1, 1)), to: new Date(Date.UTC(y, mo, 0)) };
          })()
        : fiscalYearRange(entity.fiscalYearEndMonth, year);
    // The balance sheet's current-year earnings run from the start of the fiscal year the period ends in.
    const endY = range.to.getUTCFullYear() + (range.to.getUTCMonth() + 1 > entity.fiscalYearEndMonth ? 1 : 0);
    const fyStart = fiscalYearRange(entity.fiscalYearEndMonth, endY).from;
    const periodMode: "interval" | "month" | "year" = interval ? "interval" : monthly ? "month" : "year";
    const cur = entity.currency;
    const data: Record<string, unknown> = {};
    if (report === "tb") data.tb = await trialBalance(db, entity.id, range.to);
    else if (report === "is") data.is = await incomeStatement(db, entity.id, range.from, range.to);
    else if (report === "bs") data.bs = await balanceSheet(db, entity.id, range.to, fyStart);
    else if (report === "tax") data.tax = await taxSummary(db, entity.id, range.from, range.to);
    else if (report === "st") data.st = await salesTaxReport(db, entity.id, range.from, range.to);
    else if (report === "gl") {
      const accountId = options.find((o) => o.id === sp.account && o.entityId === entity.id && !o.isGroup)?.id ?? options.find((o) => o.entityId === entity.id && !o.bank && !o.isGroup)?.id;
      if (accountId) {
        const gl = await generalLedger(db, accountId, range.from, range.to);
        data.gl = gl;
        const txIds = [...new Set(gl.lines.map((l) => l.transactionId).filter((x): x is string => !!x))];
        const txs = txIds.length ? await db.accTransaction.findMany({ where: { id: { in: txIds }, account: { entity: { ownerId: me.id } } }, select: { id: true, supplier: true, date: true, amount: true, accountId: true } }) : [];
        data.glTx = txs.map((t) => ({ id: t.id, supplier: t.supplier, date: isoDate(t.date), amount: t.amount, accountId: t.accountId }));
      }
    }
    return { entities, options, entity, range, cur, data, periodMode };
  });
  const { entities, options, entity, range, cur, data, periodMode } = out;
  const m = (n: number) => money(n, cur, lang);
  const glTx = new Map(((data.glTx as RecatTx[] | undefined) ?? []).map((t) => [t.id, t]));
  const name = (r: { name: string; nameFr: string | null }) => (fr && r.nameFr ? r.nameFr : r.name);

  const tabs: [string, string][] = [
    ["is", fr ? "État des résultats" : "Income statement"],
    ["bs", fr ? "Bilan" : "Balance sheet"],
    ["tb", fr ? "Balance de vérification" : "Trial balance"],
    ["gl", fr ? "Grand livre" : "General ledger"],
    ["tax", fr ? "Lignes d'impôt" : "Tax lines"],
    ["st", fr ? "Taxes de vente" : "Sales taxes"],
  ];
  const href = (over: Partial<Sp>) => {
    const base: Record<string, string | undefined> = { entity: entity.id, year: String(year), r: report, account: sp.account, month: sp.month, from: sp.from, to: sp.to, ...over };
    const p = new URLSearchParams(Object.entries(base).filter(([, v]) => v) as [string, string][]);
    return `/accounting/reports?${p}`;
  };

  const optById = new Map(options.map((o) => [o.id, o]));
  // Sub-categories are shown under their parent with a subtotal, to any depth, even when a parent has no balance itself.
  const Rows = ({ rows }: { rows: AccountRow[] }) => {
    const rowById = new Map(rows.map((r) => [r.id, r]));
    // Every account to show: the rows plus all their ancestors (headers such as groups carry no balance of their own).
    const needed = new Set<string>();
    for (const r of rows) {
      let id: string | null = r.id;
      while (id && !needed.has(id)) {
        needed.add(id);
        id = (rowById.has(id) ? rowById.get(id)!.parentId : optById.get(id)?.parentId) ?? null;
      }
    }
    const kids = new Map<string, string[]>();
    const roots: string[] = [];
    for (const id of needed) {
      const parent = rowById.has(id) ? rowById.get(id)!.parentId : optById.get(id)?.parentId;
      if (parent && needed.has(parent)) kids.set(parent, [...(kids.get(parent) ?? []), id]);
      else roots.push(id);
    }
    const codeOf = (id: string) => rowById.get(id)?.code ?? optById.get(id)?.code ?? "";
    const total = (id: string): number => (rowById.get(id)?.balance ?? 0) + (kids.get(id) ?? []).reduce((sum, c) => sum + total(c), 0);
    const nameOf = (id: string) => {
      const r = rowById.get(id);
      if (r) return fr && r.nameFr ? r.nameFr : r.name;
      const o = optById.get(id);
      return o ? (fr && o.nameFr ? o.nameFr : o.name) : "";
    };
    const render = (id: string, depth: number): ReactNode => {
      const children = (kids.get(id) ?? []).sort((x, y) => codeOf(x).localeCompare(codeOf(y)));
      const own = rowById.get(id);
      const pad = { paddingLeft: depth * 16 };
      if (children.length === 0) {
        return (
          <tr key={id}>
            <td className="py-1 pr-3 text-soft">{codeOf(id)}</td>
            <td className="pr-3 text-ink" style={pad}>{nameOf(id)}</td>
            <td className="text-right text-ink">{m(own?.balance ?? 0)}</td>
            <td />
            <td />
          </tr>
        );
      }
      // A header with its accounts (amounts in the middle column), then its total below them in the right-hand column.
      return (
        <Fragment key={id}>
          <tr>
            <td className="py-1 pr-3 text-soft">{codeOf(id)}</td>
            <td className={`pr-3 text-ink ${depth === 0 ? "font-semibold" : "font-medium"}`} style={pad} colSpan={4}>{nameOf(id)}</td>
          </tr>
          {own && own.balance !== 0 && (
            <tr>
              <td />
              <td className="pr-3 text-ink" style={{ paddingLeft: (depth + 1) * 16 }}>{nameOf(id)}</td>
              <td className="text-right text-ink">{m(own.balance)}</td>
              <td />
              <td />
            </tr>
          )}
          {children.map((c) => render(c, depth + 1))}
          <tr className="border-t border-card-border">
            <td />
            <td className={`py-1 pr-3 text-ink ${depth === 0 ? "font-semibold" : "font-medium"}`} style={pad}>{fr ? "Total" : "Total"} — {nameOf(id)}</td>
            <td />
            <td className={`text-right text-ink ${depth === 0 ? "font-semibold" : "font-medium"}`}>{m(total(id))}</td>
            <td />
          </tr>
        </Fragment>
      );
    };
    return <>{roots.sort((x, y) => codeOf(x).localeCompare(codeOf(y))).map((id) => render(id, 0))}</>;
  };
  // Balance-sheet sections with their own subtotals.
  const Sections = ({ rows, defs }: { rows: AccountRow[]; defs: { key: string; en: string; fr: string }[] }) => (
    <>
      {defs.map((d) => {
        const list = rows.filter((r) => r.section === d.key);
        if (list.length === 0) return null;
        return (
          <Fragment key={d.key}>
            <tr><td colSpan={5} className="pt-2 pb-0.5 text-xs font-medium text-ink">{d[lang]}</td></tr>
            <Rows rows={list} />
            <tr className="text-xs text-soft"><td /><td className="py-0.5">{fr ? "Total" : "Total"} — {d[lang]}</td><td /><td className="text-right">{m(list.reduce((s, r) => s + r.balance, 0))}</td><td /></tr>
          </Fragment>
        );
      })}
    </>
  );
  const Total = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
    <tr className={strong ? "border-t-2 border-ink font-bold" : "border-t border-card-border font-semibold"}>
      <td />
      <td className="py-1.5 pr-3 text-ink">{label}</td>
      <td />
      <td />
      <td className="text-right text-ink">{m(value)}</td>
    </tr>
  );
  const Head = ({ children }: { children: string }) => (
    <tr>
      <td colSpan={5} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-soft">{children}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {entities.map((e) => (
          <Link key={e.id} href={href({ entity: e.id, account: "" })} className={e.id === entity.id ? "btn-primary rounded-lg px-3 py-1 font-semibold" : "rounded-lg border border-card-border px-3 py-1 hover:bg-black/5"}>
            {e.name}
          </Link>
        ))}
        <span className="ml-3 text-soft">{fr ? "Année" : "Year"}:</span>
        {[year + 1, year, year - 1, year - 2].map((y) => (
          <Link key={y} href={href({ year: String(y), month: "", from: "", to: "" })} className={y === year && periodMode === "year" ? "btn-primary rounded-lg px-3 py-1 font-semibold" : "rounded-lg border border-card-border px-3 py-1 hover:bg-black/5"}>
            {y}
          </Link>
        ))}
      </div>
      <form method="get" action="/accounting/reports" className="flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="entity" value={entity.id} />
        <input type="hidden" name="r" value={report} />
        <input type="hidden" name="year" value={year} />
        {sp.account && <input type="hidden" name="account" value={sp.account} />}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? "Un mois" : "A month"}</span>
          <input type="month" name="month" defaultValue={periodMode === "month" ? sp.month : ""} className="rounded-lg border border-card-border bg-white px-2 py-1.5" />
        </label>
        <span className="pb-2 text-soft">{fr ? "ou un intervalle :" : "or an interval:"}</span>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? "Du" : "From"}</span>
          <input type="date" name="from" defaultValue={periodMode === "interval" ? sp.from : ""} className="rounded-lg border border-card-border bg-white px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? "Au" : "To"}</span>
          <input type="date" name="to" defaultValue={periodMode === "interval" ? sp.to : ""} className="rounded-lg border border-card-border bg-white px-2 py-1.5" />
        </label>
        <button className="btn-primary rounded-lg px-4 py-1.5 font-semibold">{fr ? "Afficher la période" : "Show period"}</button>
        {periodMode !== "year" && <Link href={href({ month: "", from: "", to: "" })} className="pb-2 text-soft underline">{fr ? "Retour à l'exercice" : "Back to the fiscal year"}</Link>}
      </form>
      <div className="flex flex-wrap gap-2 text-sm">
        {tabs.map(([k, label]) => (
          <Link key={k} href={href({ r: k })} className={k === report ? "rounded-lg bg-ink px-3 py-1 font-medium text-white" : "rounded-lg border border-card-border px-3 py-1 text-ink hover:bg-black/5"}>
            {label}
          </Link>
        ))}
      </div>

      <Card color="statistics" title={<>{entity.name} · {tabs.find(([k]) => k === report)?.[1]}</>}>
        <p className="text-xs text-soft">{isoDate(range.from)} → {isoDate(range.to)} · {cur}</p>

        {report === "is" && data.is ? (() => {
          const s = data.is as Awaited<ReturnType<typeof incomeStatement>>;
          return (
            <table className="mt-3 w-full max-w-3xl text-sm"><tbody>
              <Head>{fr ? "Revenus" : "Income"}</Head><Rows rows={s.income} /><Total label={fr ? "Total des revenus" : "Total income"} value={s.totalIncome} />
              {s.cogs.length > 0 && (<><Head>{fr ? "Coût des marchandises vendues" : "Cost of goods sold"}</Head><Rows rows={s.cogs} /><Total label={fr ? "Marge brute" : "Gross profit"} value={s.grossProfit} /></>)}
              <Head>{fr ? "Dépenses" : "Expenses"}</Head><Rows rows={s.expenses} /><Total label={fr ? "Total des dépenses" : "Total expenses"} value={s.totalExpenses} />
              <Total strong label={fr ? "Résultat net" : "Net income"} value={s.netIncome} />
            </tbody></table>
          );
        })() : null}

        {report === "bs" && data.bs ? (() => {
          const b = data.bs as Awaited<ReturnType<typeof balanceSheet>>;
          return (
            <>
              <table className="mt-3 w-full max-w-3xl text-sm"><tbody>
                <Head>{fr ? "Actifs" : "Assets"}</Head><Sections rows={b.assets} defs={ASSET_SECTIONS} /><Total label={fr ? "Total des actifs" : "Total assets"} value={b.totalAssets} />
                <Head>{fr ? "Passifs" : "Liabilities"}</Head><Sections rows={b.liabilities} defs={LIABILITY_SECTIONS} /><Total label={fr ? "Total des passifs" : "Total liabilities"} value={b.totalLiabilities} />
                <Head>{fr ? "Capitaux propres" : "Equity"}</Head><Rows rows={b.equity} />
                <tr><td /><td className="py-1 text-ink">{fr ? "Bénéfices non répartis" : "Retained earnings"}</td><td className="text-right">{m(b.retained)}</td><td /><td /></tr>
                <tr><td /><td className="py-1 text-ink">{fr ? "Résultat de l'exercice" : "Current-year earnings"}</td><td className="text-right">{m(b.currentEarnings)}</td><td /><td /></tr>
                <Total label={fr ? "Total des capitaux propres" : "Total equity"} value={b.totalEquity} />
                <Total strong label={fr ? "Passifs + capitaux propres" : "Liabilities + equity"} value={b.totalLiabilities + b.totalEquity} />
              </tbody></table>
              <p className={`mt-2 text-xs ${b.balanced ? "text-emerald-700" : "text-red-600"}`}>{b.balanced ? (fr ? "✓ Le bilan est équilibré." : "✓ The balance sheet balances.") : fr ? "⚠ Le bilan n'est pas équilibré." : "⚠ The balance sheet does not balance."}</p>
            </>
          );
        })() : null}

        {report === "tb" && data.tb ? (() => {
          const t = data.tb as Awaited<ReturnType<typeof trialBalance>>;
          return (
            <table className="mt-3 w-full max-w-3xl text-sm">
              <thead><tr className="text-left text-xs uppercase text-soft"><th>{fr ? "Code" : "Code"}</th><th>{fr ? "Compte" : "Account"}</th><th className="text-right">{fr ? "Débit" : "Debit"}</th><th className="text-right">{fr ? "Crédit" : "Credit"}</th></tr></thead>
              <tbody className="divide-y divide-card-border">
                {t.rows.map((r) => (<tr key={r.id}><td className="py-1 text-soft">{r.code}</td><td className="text-ink">{name(r)}</td><td className="text-right">{r.debit ? m(r.debit) : ""}</td><td className="text-right">{r.credit ? m(r.credit) : ""}</td></tr>))}
                <tr className="font-bold"><td /><td className="py-1.5">Total</td><td className="text-right">{m(t.debit)}</td><td className="text-right">{m(t.credit)}</td></tr>
              </tbody>
            </table>
          );
        })() : null}

        {report === "gl" && (
          <div className="mt-3 space-y-3">
            <form className="flex items-center gap-2 text-sm">
              <input type="hidden" name="entity" value={entity.id} /><input type="hidden" name="year" value={year} /><input type="hidden" name="r" value="gl" />
              <select name="account" defaultValue={sp.account} className="rounded-lg border border-card-border bg-white px-2 py-1.5">
                {options.filter((o) => o.entityId === entity.id && !o.isGroup).map((o) => (<option key={o.id} value={o.id}>{o.code} {fr ? o.labelFr : o.label}</option>))}
              </select>
              <button className="btn-primary rounded-lg px-3 py-1.5 font-semibold">OK</button>
            </form>
            {data.gl ? (() => {
              const g = data.gl as Awaited<ReturnType<typeof generalLedger>>;
              return (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-soft"><th>Date</th><th>{fr ? "Description" : "Description"}</th><th className="text-right">{fr ? "Débit" : "Debit"}</th><th className="text-right">{fr ? "Crédit" : "Credit"}</th><th className="text-right">{fr ? "Solde" : "Balance"}</th><th /></tr></thead>
                  <tbody className="divide-y divide-card-border">
                    <tr className="text-soft"><td /><td className="py-1">{fr ? "Solde d'ouverture" : "Opening balance"}</td><td /><td /><td className="text-right">{m(g.openingBalance)}</td><td /></tr>
                    {g.lines.map((l) => (<tr key={l.id}><td className="py-1 whitespace-nowrap text-soft">{isoDate(l.date)}</td><td className="text-ink">{l.memo}</td><td className="text-right">{l.debit ? m(l.debit) : ""}</td><td className="text-right">{l.credit ? m(l.credit) : ""}</td><td className="text-right">{m(l.balance)}</td><td className="pl-3 text-right">{l.transactionId && glTx.get(l.transactionId) ? <RecategorizeButton lang={lang} tx={glTx.get(l.transactionId)!} entities={entities} options={options} currency={cur} /> : null}</td></tr>))}
                  </tbody>
                </table>
              );
            })() : null}
          </div>
        )}

        {report === "tax" && data.tax ? (() => {
          const t = data.tax as Awaited<ReturnType<typeof taxSummary>>;
          const Block = ({ title, list }: { title: string; list: typeof t.income }) => (
            <>
              <Head>{title}</Head>
              {list.map((g) => (<tr key={g.taxLine}><td className="py-1 pr-3 text-soft">{g.taxLine}</td><td className="pr-3 text-ink">{g.accounts.join(", ")}</td><td className="text-right text-ink">{m(g.deductible)}</td><td /><td /></tr>))}
            </>
          );
          return (
            <>
              <table className="mt-3 w-full max-w-3xl text-sm"><tbody>
                <Block title={fr ? "Revenus" : "Income"} list={t.income} /><Total label={fr ? "Total des revenus" : "Total income"} value={t.totalIncome} />
                <Block title={fr ? "Dépenses déductibles" : "Deductible expenses"} list={t.expenses} /><Total label={fr ? "Total déductible" : "Total deductible"} value={t.totalDeductible} />
                <Total strong label={fr ? "Revenu net d'entreprise" : "Net business income"} value={t.netBusinessIncome} />
              </tbody></table>
              <p className="mt-2 text-xs text-soft">{fr ? "Références T2125 / Annexe C : guides à valider avec votre comptable." : "T2125 / Schedule C references: guides to confirm with your accountant."}</p>
            </>
          );
        })() : null}

        {report === "st" && data.st ? (() => {
          const s = data.st as Awaited<ReturnType<typeof salesTaxReport>>;
          const Part = ({ title, p }: { title: string; p: typeof s.gstHst }) => (
            <tbody>
              <Head>{title}</Head>
              <tr><td /><td className="py-1 text-ink">{fr ? "Perçue sur les ventes" : "Collected on sales"}</td><td className="text-right">{m(p.collected)}</td><td /><td /></tr>
              <tr><td /><td className="py-1 text-ink">{fr ? "Payée sur les achats (récupérable)" : "Paid on purchases (recoverable)"}</td><td className="text-right">{m(p.recoverable)}</td><td /><td /></tr>
              <Total label={fr ? "Net de la période" : "Net for the period"} value={p.netForPeriod} />
              <tr><td /><td className="py-1 text-ink">{fr ? "Remise payée" : "Remitted"}</td><td className="text-right">{m(p.remitted)}</td><td /><td /></tr>
              <Total strong label={fr ? "Solde à remettre" : "Balance owing"} value={p.owing} />
            </tbody>
          );
          return (
            <>
              <p className="mt-3 text-sm text-ink">{fr ? "Ventes de la période" : "Sales for the period"}: <b>{m(s.sales)}</b></p>
              <table className="mt-1 w-full max-w-3xl text-sm"><Part title="GST/HST — TPS/TVH" p={s.gstHst} /><Part title="QST — TVQ" p={s.qst} /></table>
              {!entity.salesTaxRegistered && <p className="mt-3 text-xs text-soft">{fr ? "Cette entité n'est pas inscrite aux taxes de vente : activez l'inscription dans Configuration lorsque vous dépassez 30 000 $." : "This entity is not registered for sales taxes: turn registration on in Setup once you pass $30,000."}</p>}
            </>
          );
        })() : null}
      </Card>
    </div>
  );
}
