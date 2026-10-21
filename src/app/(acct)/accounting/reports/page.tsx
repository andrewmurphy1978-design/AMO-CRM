import { Fragment, type ReactNode } from "react";
import { requireAccountingUser } from "../session";
import Card from "@/components/section-card";
import Link from "next/link";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { loadBooks } from "@/lib/accounting/options";
import { ASSET_SECTIONS, LIABILITY_SECTIONS } from "@/lib/accounting/charts";
import { balanceSheet, generalLedger, incomeStatement, periodAccountTotals, periodGroupTotals, periodTotals, salesTaxReport, taxSummary, trialBalance, type AccountRow } from "@/lib/accounting/reports";
import MoveAccountButton from "./move-account-button";
import BarChart from "./bar-chart";
import PrintButton from "./print-button";
import { resolveRange } from "@/lib/accounting/report-range";
import { seriesRanges, yearBefore, type By } from "@/lib/accounting/periods";
import RecategorizeButton, { type RecatTx } from "./recategorize-button";
import { isoDate, money } from "@/lib/accounting/format";

type Sp = { entity?: string; year?: string; r?: string; account?: string; month?: string; from?: string; to?: string; metric?: string; by?: string; count?: string; yoy?: string; group?: string; acc?: string | string[]; is?: string };


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
    const { range, fyStart, periodMode } = resolveRange(sp, entity.fiscalYearEndMonth);
    const cur = entity.currency;
    const data: Record<string, unknown> = {};
    if (report === "tb") data.tb = await trialBalance(db, entity.id, range.to);
    else if (report === "is") data.is = await incomeStatement(db, entity.id, range.from, range.to);
    else if (report === "bs") data.bs = await balanceSheet(db, entity.id, range.to, fyStart);
    else if (report === "tax") data.tax = await taxSummary(db, entity.id, range.from, range.to);
    else if (report === "st") data.st = await salesTaxReport(db, entity.id, range.from, range.to);
    else if (report === "cmp") {
      const by = (["week", "month", "quarter", "year"].includes(sp.by ?? "") ? sp.by : "month") as By;
      const defaults: Record<By, number> = { week: 12, month: 12, quarter: 8, year: 5 };
      const count = Math.min(36, Math.max(2, Number(sp.count) || defaults[by]));
      const ranges = seriesRanges(by, count, entity.fiscalYearEndMonth);
      const yoy = sp.yoy === "1" && by !== "year";
      const totals = await periodTotals(db, entity.id, yoy ? [...ranges, ...ranges.map(yearBefore)] : ranges);
      const grouped = sp.group === "1" && (sp.metric === "income" || sp.metric === "expenses");
      const breakdown = grouped ? await periodGroupTotals(db, entity.id, sp.metric === "income" ? "INCOME" : "EXPENSE", ranges) : null;
      const selected = (Array.isArray(sp.acc) ? sp.acc : sp.acc ? [sp.acc] : []).filter((id) => options.some((o) => o.id === id && o.entityId === entity.id && (o.type === "INCOME" || o.type === "EXPENSE")));
      const needAccounts = sp.metric === "accounts" || sp.is === "1";
      const accountTotals = needAccounts ? [...(await periodAccountTotals(db, entity.id, ranges)).entries()] : [];
      data.cmp = { by, count, yoy, labels: ranges.map((r) => r.label), current: totals.slice(0, ranges.length), previous: yoy ? totals.slice(ranges.length) : null, breakdown, selected, accountTotals };
    }
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
    ["cmp", fr ? "Comparer (graphique)" : "Compare (chart)"],
  ];
  const href = (over: Partial<Record<keyof Sp, string>>) => {
    const base: Record<string, string | undefined> = { entity: entity.id, year: String(year), r: report, account: sp.account, month: sp.month, from: sp.from, to: sp.to, ...over };
    const p = new URLSearchParams(Object.entries(base).filter(([, v]) => v) as [string, string][]);
    return `/accounting/reports?${p}`;
  };

  // The CSV of what is on screen: the same report, entity, period and compare choices.
  const exportQuery = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, entity: entity.id, r: report })) {
    for (const x of Array.isArray(v) ? v : v ? [v] : []) exportQuery.append(k, x);
  }
  const exportHref = `/accounting/reports/export?${exportQuery}`;
  const optById = new Map(options.map((o) => [o.id, o]));
  // Four amount columns, from the lowest level on the left to the report total on the right: sub-account amounts,
  // account totals, section (or group) totals, and the total of the whole block (assets, income...).
  const NCOL = 4;
  const numCells = (col: number, content: ReactNode, cls = "text-ink") =>
    Array.from({ length: NCOL }, (_, i) => (i + 1 === col ? <td key={i} className={`text-right ${cls}`}>{content}</td> : <td key={i} />));
  // Sub-categories are shown under their parent with a subtotal, to any depth, even when a parent has no balance itself.
  // `topCol` is the column of the top level of this block; each level down sits one column further left.
  const Rows = ({ rows, topCol }: { rows: AccountRow[]; topCol: number }) => {
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
    const colOf = (depth: number) => Math.max(1, topCol - depth);
    const render = (id: string, depth: number): ReactNode => {
      const children = (kids.get(id) ?? []).sort((x, y) => codeOf(x).localeCompare(codeOf(y)));
      const own = rowById.get(id);
      const pad = { paddingLeft: depth * 16 };
      if (children.length === 0) {
        return (
          <tr key={id}>
            <td className="py-1 pr-3 text-soft">{codeOf(id)}</td>
            <td className="pr-3 text-ink" style={pad}>{nameOf(id)}</td>
            {numCells(colOf(depth), m(own?.balance ?? 0))}
          </tr>
        );
      }
      // A header with its accounts, then its total below them, one column to the right of the accounts' amounts.
      return (
        <Fragment key={id}>
          <tr>
            <td className="py-1 pr-3 text-soft">{codeOf(id)}</td>
            <td className={`pr-3 text-ink ${depth === 0 ? "font-semibold" : "font-medium"}`} style={pad} colSpan={NCOL + 1}>{nameOf(id)}</td>
          </tr>
          {own && own.balance !== 0 && (
            <tr>
              <td />
              <td className="pr-3 text-ink" style={{ paddingLeft: (depth + 1) * 16 }}>{nameOf(id)}</td>
              {numCells(colOf(depth + 1), m(own.balance))}
            </tr>
          )}
          {children.map((c) => render(c, depth + 1))}
          <tr className="border-t border-card-border">
            <td />
            <td className={`py-1 pr-3 text-ink ${depth === 0 ? "font-semibold" : "font-medium"}`} style={pad}>{fr ? "Total" : "Total"} — {nameOf(id)}</td>
            {numCells(colOf(depth), m(total(id)), depth === 0 ? "font-semibold text-ink" : "font-medium text-ink")}
          </tr>
        </Fragment>
      );
    };
    return <>{roots.sort((x, y) => codeOf(x).localeCompare(codeOf(y))).map((id) => render(id, 0))}</>;
  };
  // Balance-sheet sections: their accounts (and sub-accounts) with the section total in the third column.
  const Sections = ({ rows, defs }: { rows: AccountRow[]; defs: { key: string; en: string; fr: string }[] }) => (
    <>
      {defs.map((d) => {
        const list = rows.filter((r) => r.section === d.key);
        if (list.length === 0) return null;
        return (
          <Fragment key={d.key}>
            <tr><td colSpan={NCOL + 2} className="pt-3 pb-0.5 text-sm font-semibold text-ink">{d[lang]}</td></tr>
            <Rows rows={list} topCol={2} />
            <tr className="border-t border-card-border"><td /><td className="py-1 pr-3 font-semibold text-ink">{fr ? "Total" : "Total"} — {d[lang]}</td>{numCells(3, m(list.reduce((sum, r) => sum + r.balance, 0)), "font-semibold text-ink")}</tr>
          </Fragment>
        );
      })}
    </>
  );
  // Total of a whole block (income, expenses, assets...), in the last column.
  const Total = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
    <tr className={strong ? "border-t-2 border-ink font-bold" : "border-t border-card-border font-semibold"}>
      <td />
      <td className="py-1.5 pr-3 text-ink">{label}</td>
      {numCells(4, m(value))}
    </tr>
  );
  const Head = ({ children }: { children: string }) => (
    <tr>
      <td colSpan={NCOL + 2} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-soft">{children}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div data-print-hide className="flex flex-wrap items-center gap-2 text-sm">
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
      {report !== "cmp" && <form data-print-hide method="get" action="/accounting/reports" className="flex flex-wrap items-end gap-3 text-sm">
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
      </form>}
      <div data-print-hide className="flex flex-wrap items-center gap-2 text-sm">
        {tabs.map(([k, label]) => (
          <Link key={k} href={href({ r: k })} className={k === report ? "rounded-lg bg-ink px-3 py-1 font-medium text-white" : "rounded-lg border border-card-border px-3 py-1 text-ink hover:bg-black/5"}>
            {label}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <a href={exportHref} className="rounded-lg border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5">{fr ? "Exporter en CSV" : "Export to CSV"}</a>
          <PrintButton label={fr ? "Imprimer / PDF" : "Print / PDF"} />
        </span>
      </div>

      <Card color="statistics" title={<>{entity.name} · {tabs.find(([k]) => k === report)?.[1]}</>}>
        <div className="hidden print:block">
          <p className="font-display text-xl font-semibold text-ink">{entity.name}</p>
          <p className="text-sm text-soft">{tabs.find(([k]) => k === report)?.[1]}{report !== "cmp" ? ` — ${isoDate(range.from)} → ${isoDate(range.to)}` : ""} · {cur}</p>
        </div>
        {report !== "cmp" && <p className="text-xs text-soft print:hidden">{isoDate(range.from)} → {isoDate(range.to)} · {cur}</p>}

        {report === "cmp" && data.cmp ? (() => {
          const c = data.cmp as { by: By; count: number; yoy: boolean; labels: string[]; current: { income: number; expenses: number; net: number }[]; previous: { income: number; expenses: number; net: number }[] | null; breakdown: { groups: { id: string; code: string; name: string; nameFr: string | null }[]; values: number[][] } | null; selected: string[]; accountTotals: [string, number[]][] };
          const metric = sp.metric === "income" || sp.metric === "expenses" || sp.metric === "net" || sp.metric === "accounts" ? sp.metric : "both";
          const accTotals = new Map(c.accountTotals);
          const label = { income: fr ? "Revenus" : "Income", expenses: fr ? "Dépenses" : "Expenses", net: fr ? "Résultat net" : "Net" };
          const GREEN = "#059669";
          const ROSE = "#e11d48";
          const BLUE = "#0284c7";
          const PALETTE = ["#2563eb", "#d97706", "#059669", "#7c3aed", "#e11d48", "#0891b2", "#65a30d", "#c026d3", "#64748b"];
          const zeros = c.labels.map(() => 0);
          const optOf = (id: string) => options.find((o) => o.id === id);
          const accName = (id: string) => {
            const o = optOf(id);
            return o ? `${o.code} ${fr ? o.labelFr : o.label}` : id;
          };
          const series: { name: string; color: string; values: number[] }[] = [];
          if (metric === "accounts") {
            c.selected.slice(0, 10).forEach((id, i) => series.push({ name: accName(id), color: PALETTE[i % PALETTE.length], values: accTotals.get(id) ?? zeros }));
          } else if (metric === "both") {
            series.push({ name: label.income, color: GREEN, values: c.current.map((t) => t.income) }, { name: label.expenses, color: ROSE, values: c.current.map((t) => t.expenses) });
          } else {
            const color = metric === "income" ? GREEN : metric === "expenses" ? ROSE : BLUE;
            series.push({ name: label[metric], color, values: c.current.map((t) => t[metric]) });
            if (c.previous && !c.breakdown) series.push({ name: `${label[metric]} — ${fr ? "année précédente" : "previous year"}`, color: color + "66", values: c.previous.map((t) => t[metric]) });
          }
          const stackSeries = c.breakdown ? c.breakdown.groups.map((g, i) => ({ name: g.id === "__other__" ? (fr ? "Autres" : "Other") : fr && g.nameFr ? g.nameFr : g.name, color: PALETTE[i % PALETTE.length], values: c.breakdown!.values[i] })) : null;
          // Specific accounts: one column per account in the table (no stacking).
          const columnSeries = stackSeries ?? (metric === "accounts" ? series : null);
          const rowMetric = metric === "both" || metric === "accounts" ? "net" : metric;
          const pct = (cur: number, prev: number) => (prev === 0 ? "—" : `${(((cur - prev) / Math.abs(prev)) * 100).toFixed(0)} %`);
          return (
            <div className="space-y-3">
              <form data-print-hide method="get" action="/accounting/reports" className="flex flex-wrap items-end gap-3 text-sm">
                <input type="hidden" name="entity" value={entity.id} />
                <input type="hidden" name="r" value="cmp" />
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-soft">{fr ? "Mesure" : "Measure"}</span>
                  <select name="metric" defaultValue={metric} className="rounded-lg border border-card-border bg-white px-2 py-1.5">
                    <option value="both">{fr ? "Revenus et dépenses" : "Income and expenses"}</option>
                    <option value="income">{label.income}</option>
                    <option value="expenses">{label.expenses}</option>
                    <option value="net">{label.net}</option>
                    <option value="accounts">{fr ? "Comptes précis…" : "Specific accounts…"}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-soft">{fr ? "Par" : "By"}</span>
                  <select name="by" defaultValue={c.by} className="rounded-lg border border-card-border bg-white px-2 py-1.5">
                    <option value="week">{fr ? "Semaine" : "Week"}</option>
                    <option value="month">{fr ? "Mois" : "Month"}</option>
                    <option value="quarter">{fr ? "Trimestre" : "Quarter"}</option>
                    <option value="year">{fr ? "Exercice" : "Fiscal year"}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-soft">{fr ? "Nombre de périodes" : "Number of periods"}</span>
                  <input type="number" name="count" min={2} max={36} defaultValue={c.count} className="w-24 rounded-lg border border-card-border bg-white px-2 py-1.5" />
                </label>
                <label className="flex items-center gap-2 pb-2 text-soft">
                  <input type="checkbox" name="yoy" value="1" defaultChecked={c.yoy} disabled={false} /> {fr ? "Comparer à l'année précédente" : "Compare with the previous year"}
                </label>
                <label className="flex items-center gap-2 pb-2 text-soft" title={fr ? "Seulement pour « Revenus » ou « Dépenses »" : "Only for “Income” or “Expenses”"}>
                  <input type="checkbox" name="group" value="1" defaultChecked={!!c.breakdown} /> {fr ? "Détailler par groupe" : "Break down by group"}
                </label>
                <label className="flex items-center gap-2 pb-2 text-soft">
                  <input type="checkbox" name="is" value="1" defaultChecked={sp.is === "1"} /> {fr ? "Afficher l'état des résultats par période" : "Show the income statement by period"}
                </label>
                <details open={metric === "accounts"} className="w-full rounded-lg border border-card-border bg-white p-2">
                  <summary className="cursor-pointer text-sm text-ink">{fr ? `Comptes à comparer (${c.selected.length} choisis) — utilisés avec la mesure « Comptes précis »` : `Accounts to compare (${c.selected.length} chosen) — used with the “Specific accounts” measure`}</summary>
                  <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {options.filter((o) => o.entityId === entity.id && (o.type === "INCOME" || o.type === "EXPENSE") && !o.isGroup).map((o) => (
                      <label key={o.id} className="flex items-center gap-2 text-xs text-ink">
                        <input type="checkbox" name="acc" value={o.id} defaultChecked={c.selected.includes(o.id)} />
                        <span className="text-soft">{o.type === "INCOME" ? (fr ? "Rev." : "Inc.") : fr ? "Dép." : "Exp."}</span> {o.code} {fr ? o.labelFr : o.label}
                      </label>
                    ))}
                  </div>
                </details>
                <button className="btn-primary rounded-lg px-4 py-1.5 font-semibold">{fr ? "Afficher" : "Show"}</button>
              </form>
              {metric === "accounts" && c.selected.length === 0 && <p className="text-xs text-amber-700">{fr ? "Cochez un ou plusieurs comptes dans la liste." : "Tick one or more accounts in the list."}</p>}
              {sp.group === "1" && !c.breakdown && <p className="text-xs text-amber-700">{fr ? "Choisissez « Revenus » ou « Dépenses » comme mesure pour détailler par groupe." : "Choose “Income” or “Expenses” as the measure to break down by group."}</p>}
              <BarChart labels={c.labels} series={stackSeries ?? series} stacked={!!stackSeries} currency={cur} lang={lang} title={`${entity.name} — ${metric === "both" ? `${label.income} / ${label.expenses}` : metric === "accounts" ? (fr ? "Comptes choisis" : "Selected accounts") : label[metric]}`} />
              {columnSeries && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-soft">
                        <th className="py-1">{fr ? "Période" : "Period"}</th>
                        {columnSeries.map((g) => <th key={g.name} className="text-right"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: g.color }} />{g.name}</th>)}
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {c.labels.map((l, i) => (
                        <tr key={l}>
                          <td className="py-1 text-ink">{l}</td>
                          {columnSeries.map((g) => <td key={g.name} className="text-right text-ink">{m(g.values[i] ?? 0)}</td>)}
                          <td className="text-right font-semibold text-ink">{m(columnSeries.reduce((sum, g) => sum + (g.values[i] ?? 0), 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!columnSeries && <table className="w-full max-w-5xl text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-soft">
                    <th className="py-1">{fr ? "Période" : "Period"}</th>
                    <th className="text-right">{label.income}</th>
                    <th className="text-right">{label.expenses}</th>
                    <th className="text-right">{label.net}</th>
                    {c.previous && <th className="text-right">{fr ? `${label[rowMetric]}, année précédente` : `${label[rowMetric]}, previous year`}</th>}
                    {c.previous && <th className="text-right">{fr ? "Variation" : "Change"}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {c.labels.map((l, i) => (
                    <tr key={l}>
                      <td className="py-1 text-ink">{l}</td>
                      <td className="text-right text-emerald-700">{m(c.current[i].income)}</td>
                      <td className="text-right text-ink">{m(c.current[i].expenses)}</td>
                      <td className={`text-right font-medium ${c.current[i].net < 0 ? "text-red-600" : "text-ink"}`}>{m(c.current[i].net)}</td>
                      {c.previous && <td className="text-right text-soft">{m(c.previous[i][rowMetric])}</td>}
                      {c.previous && <td className="text-right text-soft">{pct(c.current[i][rowMetric], c.previous[i][rowMetric])}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>}
              {sp.is === "1" && (() => {
                const inEntity = options.filter((o) => o.entityId === entity.id && (o.type === "INCOME" || o.type === "EXPENSE"));
                const needed = new Set<string>();
                for (const [id, row] of accTotals) {
                  if (!row.some((v) => v !== 0)) continue;
                  let cur: string | null = id;
                  while (cur && !needed.has(cur)) {
                    needed.add(cur);
                    cur = optOf(cur)?.parentId ?? null;
                  }
                }
                const kids = new Map<string, string[]>();
                const roots: Record<"INCOME" | "EXPENSE", string[]> = { INCOME: [], EXPENSE: [] };
                for (const o of inEntity) {
                  if (!needed.has(o.id)) continue;
                  if (o.parentId && needed.has(o.parentId)) kids.set(o.parentId, [...(kids.get(o.parentId) ?? []), o.id]);
                  else roots[o.type as "INCOME" | "EXPENSE"].push(o.id);
                }
                const sumRow = (id: string): number[] => (kids.get(id) ?? []).reduce((acc, k) => acc.map((v, i) => v + sumRow(k)[i]), [...(accTotals.get(id) ?? zeros)]);
                const code = (id: string) => optOf(id)?.code ?? "";
                const cells = (row: number[], cls: string) => [...row, row.reduce((x, y) => x + y, 0)].map((v, i) => <td key={i} className={`text-right ${cls} ${i === row.length ? "font-semibold" : ""}`}>{m(v)}</td>);
                const renderNode = (id: string, depth: number): ReactNode => {
                  const children = (kids.get(id) ?? []).sort((x, y) => code(x).localeCompare(code(y)));
                  const o = optOf(id)!;
                  return (
                    <Fragment key={id}>
                      <tr className={children.length > 0 ? "bg-black/[0.03]" : ""}>
                        <td className={`py-1 pr-3 text-ink ${depth === 0 || children.length > 0 ? "font-semibold" : ""}`} style={{ paddingLeft: depth * 16 }}>{o.code} {fr ? o.labelFr.split(" › ").pop() : o.name}</td>
                        {cells(sumRow(id), "text-ink")}
                      </tr>
                      {children.sort((x, y) => code(x).localeCompare(code(y))).map((k) => renderNode(k, depth + 1))}
                    </Fragment>
                  );
                };
                const totalRow = (type: "INCOME" | "EXPENSE") => roots[type].reduce((acc, id) => acc.map((v, i) => v + sumRow(id)[i]), [...zeros]);
                const incomeRow = totalRow("INCOME");
                const expenseRow = totalRow("EXPENSE");
                return (
                  <div className="overflow-x-auto">
                    <p className="mt-2 text-sm font-semibold text-ink">{fr ? "État des résultats par période" : "Income statement by period"}</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-soft">
                          <th className="py-1">{fr ? "Compte" : "Account"}</th>
                          {c.labels.map((l) => <th key={l} className="text-right">{l}</th>)}
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-border">
                        <tr><td colSpan={c.labels.length + 2} className="pt-2 text-xs font-semibold uppercase tracking-wide text-soft">{label.income}</td></tr>
                        {roots.INCOME.sort((x, y) => code(x).localeCompare(code(y))).map((id) => renderNode(id, 0))}
                        <tr className="border-t-2 border-card-border font-semibold"><td className="py-1 text-ink">{fr ? "Total des revenus" : "Total income"}</td>{cells(incomeRow, "text-emerald-700")}</tr>
                        <tr><td colSpan={c.labels.length + 2} className="pt-2 text-xs font-semibold uppercase tracking-wide text-soft">{label.expenses}</td></tr>
                        {roots.EXPENSE.sort((x, y) => code(x).localeCompare(code(y))).map((id) => renderNode(id, 0))}
                        <tr className="border-t-2 border-card-border font-semibold"><td className="py-1 text-ink">{fr ? "Total des dépenses" : "Total expenses"}</td>{cells(expenseRow, "text-ink")}</tr>
                        <tr className="border-t-2 border-ink font-bold"><td className="py-1.5 text-ink">{label.net}</td>{cells(incomeRow.map((v, i) => v - expenseRow[i]), "text-ink")}</tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              <p className="text-xs text-soft">{fr ? "La dernière période va jusqu'à aujourd'hui." : "The last period runs to today."}</p>
            </div>
          );
        })() : null}

        {report === "is" && data.is ? (() => {
          const s = data.is as Awaited<ReturnType<typeof incomeStatement>>;
          return (
            <table className="mt-3 w-full max-w-5xl text-sm"><tbody>
              <Head>{fr ? "Revenus" : "Income"}</Head><Rows rows={s.income} topCol={3} /><Total label={fr ? "Total des revenus" : "Total income"} value={s.totalIncome} />
              {s.cogs.length > 0 && (<><Head>{fr ? "Coût des marchandises vendues" : "Cost of goods sold"}</Head><Rows rows={s.cogs} topCol={3} /><Total label={fr ? "Marge brute" : "Gross profit"} value={s.grossProfit} /></>)}
              <Head>{fr ? "Dépenses" : "Expenses"}</Head><Rows rows={s.expenses} topCol={3} /><Total label={fr ? "Total des dépenses" : "Total expenses"} value={s.totalExpenses} />
              <Total strong label={fr ? "Résultat net" : "Net income"} value={s.netIncome} />
            </tbody></table>
          );
        })() : null}

        {report === "bs" && data.bs ? (() => {
          const b = data.bs as Awaited<ReturnType<typeof balanceSheet>>;
          return (
            <>
              <table className="mt-3 w-full max-w-5xl text-sm"><tbody>
                <Head>{fr ? "Actifs" : "Assets"}</Head><Sections rows={b.assets} defs={ASSET_SECTIONS} /><Total label={fr ? "Total des actifs" : "Total assets"} value={b.totalAssets} />
                <Head>{fr ? "Passifs" : "Liabilities"}</Head><Sections rows={b.liabilities} defs={LIABILITY_SECTIONS} /><Total label={fr ? "Total des passifs" : "Total liabilities"} value={b.totalLiabilities} />
                <Head>{fr ? "Capitaux propres" : "Equity"}</Head><Rows rows={b.equity} topCol={3} />
                <tr><td /><td className="py-1 text-ink">{fr ? "Bénéfices non répartis" : "Retained earnings"}</td>{numCells(3, m(b.retained))}</tr>
                <tr><td /><td className="py-1 text-ink">{fr ? "Résultat de l'exercice" : "Current-year earnings"}</td>{numCells(3, m(b.currentEarnings))}</tr>
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
            <form data-print-hide className="flex items-center gap-2 text-sm">
              <input type="hidden" name="entity" value={entity.id} /><input type="hidden" name="year" value={year} /><input type="hidden" name="r" value="gl" />
              <select name="account" defaultValue={sp.account} className="rounded-lg border border-card-border bg-white px-2 py-1.5">
                {options.filter((o) => o.entityId === entity.id && !o.isGroup).map((o) => (<option key={o.id} value={o.id}>{o.code} {fr ? o.labelFr : o.label}</option>))}
              </select>
              <button className="btn-primary rounded-lg px-3 py-1.5 font-semibold">OK</button>
            </form>
            {data.gl ? (() => {
              const cur = options.find((o) => o.id === (data.gl as Awaited<ReturnType<typeof generalLedger>>).account.id);
              return cur ? <div data-print-hide><MoveAccountButton lang={lang} from={cur} options={options} /></div> : null;
            })() : null}
            {data.gl ? (() => {
              const g = data.gl as Awaited<ReturnType<typeof generalLedger>>;
              return (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-soft"><th>Date</th><th>{fr ? "Description" : "Description"}</th><th className="text-right">{fr ? "Débit" : "Debit"}</th><th className="text-right">{fr ? "Crédit" : "Credit"}</th><th className="text-right">{fr ? "Solde" : "Balance"}</th><th /></tr></thead>
                  <tbody className="divide-y divide-card-border">
                    <tr className="text-soft"><td /><td className="py-1">{fr ? "Solde d'ouverture" : "Opening balance"}</td><td /><td /><td className="text-right">{m(g.openingBalance)}</td><td /></tr>
                    {g.lines.map((l) => (<tr key={l.id}><td className="py-1 whitespace-nowrap text-soft">{isoDate(l.date)}</td><td className="text-ink">{l.memo}</td><td className="text-right">{l.debit ? m(l.debit) : ""}</td><td className="text-right">{l.credit ? m(l.credit) : ""}</td><td className="text-right">{m(l.balance)}</td><td data-print-hide className="pl-3 text-right">{l.transactionId && glTx.get(l.transactionId) ? <RecategorizeButton lang={lang} tx={glTx.get(l.transactionId)!} entities={entities} options={options} currency={cur} /> : null}</td></tr>))}
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
              {list.map((g) => (<tr key={g.taxLine}><td className="py-1 pr-3 text-soft">{g.taxLine}</td><td className="pr-3 text-ink">{g.accounts.join(", ")}</td>{numCells(3, m(g.deductible))}</tr>))}
            </>
          );
          return (
            <>
              <table className="mt-3 w-full max-w-5xl text-sm"><tbody>
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
              <tr><td /><td className="py-1 text-ink">{fr ? "Perçue sur les ventes" : "Collected on sales"}</td>{numCells(3, m(p.collected))}</tr>
              <tr><td /><td className="py-1 text-ink">{fr ? "Payée sur les achats (récupérable)" : "Paid on purchases (recoverable)"}</td>{numCells(3, m(p.recoverable))}</tr>
              <Total label={fr ? "Net de la période" : "Net for the period"} value={p.netForPeriod} />
              <tr><td /><td className="py-1 text-ink">{fr ? "Remise payée" : "Remitted"}</td>{numCells(3, m(p.remitted))}</tr>
              <Total strong label={fr ? "Solde à remettre" : "Balance owing"} value={p.owing} />
            </tbody>
          );
          return (
            <>
              <p className="mt-3 text-sm text-ink">{fr ? "Ventes de la période" : "Sales for the period"}: <b>{m(s.sales)}</b></p>
              <table className="mt-1 w-full max-w-5xl text-sm"><Part title="GST/HST — TPS/TVH" p={s.gstHst} /><Part title="QST — TVQ" p={s.qst} /></table>
              {!entity.salesTaxRegistered && <p className="mt-3 text-xs text-soft">{fr ? "Cette entité n'est pas inscrite aux taxes de vente : activez l'inscription dans Configuration lorsque vous dépassez 30 000 $." : "This entity is not registered for sales taxes: turn registration on in Setup once you pass $30,000."}</p>}
            </>
          );
        })() : null}
      </Card>
    </div>
  );
}
