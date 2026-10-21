import type { PrismaClient } from "@/lib/prisma";
import type { AccountOption, EntityInfo } from "./options";
import { balanceSheet, generalLedger, incomeStatement, periodAccountTotals, periodGroupTotals, periodTotals, salesTaxReport, taxSummary, trialBalance, type AccountRow } from "./reports";
import { seriesRanges, yearBefore, type By } from "./periods";
import { resolveRange } from "./report-range";

// The reports as CSV rows (plain decimals, no currency symbols, so a spreadsheet can add them up).

export type ReportParams = {
  r?: string;
  entity?: string;
  year?: string;
  month?: string;
  from?: string;
  to?: string;
  account?: string;
  metric?: string;
  by?: string;
  count?: string;
  yoy?: string;
  group?: string;
  acc?: string | string[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const t = String(v ?? "");
    return /[",\r\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  // A BOM so Excel opens accents correctly.
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function reportRows(db: PrismaClient, entity: EntityInfo, options: AccountOption[], p: ReportParams, lang: "en" | "fr"): Promise<{ title: string; rows: (string | number)[][] }> {
  const fr = lang === "fr";
  const { range, fyStart } = resolveRange(p, entity.fiscalYearEndMonth);
  const head = (title: string): (string | number)[][] => [[entity.name], [title], [`${iso(range.from)} → ${iso(range.to)}`, entity.currency], []];
  const name = (r: { name: string; nameFr: string | null }) => (fr && r.nameFr ? r.nameFr : r.name);
  const report = p.r ?? "is";

  if (report === "is") {
    const s = await incomeStatement(db, entity.id, range.from, range.to);
    const block = (title: string, list: AccountRow[], total: number) => [[title], ...list.map((r) => [r.code, name(r), n(r.balance)]), [fr ? `Total — ${title}` : `Total — ${title}`, "", n(total)], []];
    return {
      title: fr ? "etat-des-resultats" : "income-statement",
      rows: [
        ...head(fr ? "État des résultats" : "Income statement"),
        ...block(fr ? "Revenus" : "Income", s.income, s.totalIncome),
        ...(s.cogs.length ? block(fr ? "Coût des marchandises vendues" : "Cost of goods sold", s.cogs, s.totalCogs) : []),
        ...block(fr ? "Dépenses" : "Expenses", s.expenses, s.totalExpenses),
        [fr ? "Résultat net" : "Net income", "", n(s.netIncome)],
      ],
    };
  }
  if (report === "bs") {
    const b = await balanceSheet(db, entity.id, range.to, fyStart);
    const block = (title: string, list: AccountRow[], total: number) => [[title], ...list.map((r) => [r.code, name(r), r.section ?? "", n(r.balance)]), [fr ? `Total — ${title}` : `Total — ${title}`, "", "", n(total)], []];
    return {
      title: fr ? "bilan" : "balance-sheet",
      rows: [
        ...head(fr ? "Bilan" : "Balance sheet"),
        ...block(fr ? "Actifs" : "Assets", b.assets, b.totalAssets),
        ...block(fr ? "Passifs" : "Liabilities", b.liabilities, b.totalLiabilities),
        [fr ? "Capitaux propres" : "Equity"],
        ...b.equity.map((r) => [r.code, name(r), "", n(r.balance)]),
        ["", fr ? "Bénéfices non répartis" : "Retained earnings", "", n(b.retained)],
        ["", fr ? "Résultat de l'exercice" : "Current-year earnings", "", n(b.currentEarnings)],
        [fr ? "Total — Capitaux propres" : "Total — Equity", "", "", n(b.totalEquity)],
      ],
    };
  }
  if (report === "tb") {
    const t = await trialBalance(db, entity.id, range.to);
    return {
      title: fr ? "balance-de-verification" : "trial-balance",
      rows: [...head(fr ? "Balance de vérification" : "Trial balance"), ["Code", fr ? "Compte" : "Account", fr ? "Débit" : "Debit", fr ? "Crédit" : "Credit"], ...t.rows.map((r) => [r.code, name(r), n(r.debit), n(r.credit)]), ["", "Total", n(t.debit), n(t.credit)]],
    };
  }
  if (report === "gl") {
    const id = options.find((o) => o.id === p.account && o.entityId === entity.id && !o.isGroup)?.id ?? options.find((o) => o.entityId === entity.id && !o.bank && !o.isGroup)?.id;
    if (!id) return { title: "general-ledger", rows: head("General ledger") };
    const g = await generalLedger(db, id, range.from, range.to);
    return {
      title: `${fr ? "grand-livre" : "general-ledger"}-${g.account.code}`,
      rows: [
        ...head(`${fr ? "Grand livre" : "General ledger"} — ${g.account.code} ${name(g.account)}`),
        ["Date", "Description", fr ? "Débit" : "Debit", fr ? "Crédit" : "Credit", fr ? "Solde" : "Balance"],
        ["", fr ? "Solde d'ouverture" : "Opening balance", "", "", n(g.openingBalance)],
        ...g.lines.map((l) => [iso(l.date), l.memo ?? "", l.debit ? n(l.debit) : "", l.credit ? n(l.credit) : "", n(l.balance)]),
      ],
    };
  }
  if (report === "tax") {
    const t = await taxSummary(db, entity.id, range.from, range.to);
    const block = (title: string, list: typeof t.income) => [[title], ...list.map((g) => [g.taxLine, g.accounts.join(" / "), n(g.amount), n(g.deductible)]), []];
    return {
      title: fr ? "lignes-d-impot" : "tax-lines",
      rows: [...head(fr ? "Lignes d'impôt" : "Tax lines"), ["", "", fr ? "Montant" : "Amount", fr ? "Déductible" : "Deductible"], ...block(fr ? "Revenus" : "Income", t.income), ...block(fr ? "Dépenses" : "Expenses", t.expenses), [fr ? "Total des revenus" : "Total income", "", n(t.totalIncome)], [fr ? "Total déductible" : "Total deductible", "", "", n(t.totalDeductible)], [fr ? "Revenu net d'entreprise" : "Net business income", "", n(t.netBusinessIncome)]],
    };
  }
  if (report === "st") {
    const s = await salesTaxReport(db, entity.id, range.from, range.to);
    const part = (t: string, x: typeof s.gstHst) => [[t], [fr ? "Perçue sur les ventes" : "Collected on sales", n(x.collected)], [fr ? "Payée sur les achats (récupérable)" : "Paid on purchases (recoverable)", n(x.recoverable)], [fr ? "Net de la période" : "Net for the period", n(x.netForPeriod)], [fr ? "Remise payée" : "Remitted", n(x.remitted)], [fr ? "Solde à remettre" : "Balance owing", n(x.owing)], []];
    return { title: fr ? "taxes-de-vente" : "sales-taxes", rows: [...head(fr ? "Taxes de vente" : "Sales taxes"), [fr ? "Ventes de la période" : "Sales for the period", n(s.sales)], [], ...part("GST/HST — TPS/TVH", s.gstHst), ...part("QST — TVQ", s.qst)] };
  }
  // Compare: one row per period.
  const by = (["week", "month", "quarter", "year"].includes(p.by ?? "") ? p.by : "month") as By;
  const defaults: Record<By, number> = { week: 12, month: 12, quarter: 8, year: 5 };
  const count = Math.min(36, Math.max(2, Number(p.count) || defaults[by]));
  const ranges = seriesRanges(by, count, entity.fiscalYearEndMonth);
  const labels = ranges.map((r) => r.label);
  const title = fr ? "comparaison" : "comparison";
  const top = [[entity.name], [fr ? "Comparaison" : "Comparison", by, entity.currency], []];
  if (p.metric === "accounts") {
    const selected = (Array.isArray(p.acc) ? p.acc : p.acc ? [p.acc] : []).filter((id) => options.some((o) => o.id === id && o.entityId === entity.id));
    const totals = await periodAccountTotals(db, entity.id, ranges);
    return { title, rows: [...top, [fr ? "Période" : "Period", ...selected.map((id) => options.find((o) => o.id === id)?.code + " " + name(options.find((o) => o.id === id)!))], ...labels.map((l, i) => [l, ...selected.map((id) => n(totals.get(id)?.[i] ?? 0))])] };
  }
  if (p.group === "1" && (p.metric === "income" || p.metric === "expenses")) {
    const g = await periodGroupTotals(db, entity.id, p.metric === "income" ? "INCOME" : "EXPENSE", ranges);
    return { title, rows: [...top, [fr ? "Période" : "Period", ...g.groups.map((x) => (x.id === "__other__" ? (fr ? "Autres" : "Other") : name(x))), "Total"], ...labels.map((l, i) => [l, ...g.values.map((v) => n(v[i] ?? 0)), n(g.values.reduce((s, v) => s + (v[i] ?? 0), 0))])] };
  }
  const yoy = p.yoy === "1" && by !== "year";
  const totals = await periodTotals(db, entity.id, yoy ? [...ranges, ...ranges.map(yearBefore)] : ranges);
  return {
    title,
    rows: [
      ...top,
      [fr ? "Période" : "Period", fr ? "Revenus" : "Income", fr ? "Dépenses" : "Expenses", fr ? "Résultat net" : "Net", ...(yoy ? [fr ? "Revenus (année précédente)" : "Income (previous year)", fr ? "Dépenses (année précédente)" : "Expenses (previous year)", fr ? "Résultat net (année précédente)" : "Net (previous year)"] : [])],
      ...labels.map((l, i) => [l, n(totals[i].income), n(totals[i].expenses), n(totals[i].net), ...(yoy ? [n(totals[ranges.length + i].income), n(totals[ranges.length + i].expenses), n(totals[ranges.length + i].net)] : [])]),
    ],
  };
}
