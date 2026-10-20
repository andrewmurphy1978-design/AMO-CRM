import type { PrismaClient } from "@/lib/prisma";
import { defaultSection, isTwoWay } from "./charts";
import { r2 } from "./posting";

// Reports are read straight off the journal lines: nothing is stored twice, so a report is always the books.

export interface AccountRow {
  id: string;
  code: string;
  templateCode: string;
  name: string;
  nameFr: string | null;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  subtype: string;
  // Balance-sheet section (assets / liabilities only).
  section: string | null;
  twoWay: boolean;
  altCode: string | null;
  altName: string | null;
  altNameFr: string | null;
  parentId: string | null;
  gifi: string | null;
  taxLine: string | null;
  deductiblePct: number;
  debit: number;
  credit: number;
  // Balance in the account's natural direction (assets / expenses: debits − credits; the rest: credits − debits).
  balance: number;
}

const natural = (type: AccountRow["type"], debit: number, credit: number) => (type === "ASSET" || type === "EXPENSE" ? debit - credit : credit - debit);

/** Fiscal year `year` of an entity whose year ends in `endMonth` (12 = calendar year). */
export function fiscalYearRange(endMonth: number, year: number): { from: Date; to: Date } {
  const to = new Date(Date.UTC(year, endMonth, 0)); // last day of endMonth
  const from = new Date(Date.UTC(endMonth === 12 ? year : year - 1, endMonth === 12 ? 0 : endMonth, 1));
  return { from, to };
}

export async function accountRows(db: PrismaClient, entityId: string, range: { from?: Date; to?: Date }, includeEmpty = false): Promise<AccountRow[]> {
  const [accounts, sums] = await Promise.all([
    db.accAccount.findMany({ where: { entityId }, orderBy: [{ code: "asc" }] }),
    db.accJournalLine.groupBy({
      by: ["accountId"],
      where: { entry: { entityId, ...(range.from || range.to ? { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}) } },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const byId = new Map(sums.map((s) => [s.accountId, s._sum]));
  const rows = accounts.map((a) => {
    const s = byId.get(a.id);
    const debit = r2(s?.debit ?? 0);
    const credit = r2(s?.credit ?? 0);
    return { id: a.id, code: a.code, templateCode: a.templateCode ?? a.code, name: a.name, nameFr: a.nameFr, type: a.type, subtype: a.subtype, section: a.section ?? defaultSection(a.type, a.subtype), twoWay: a.twoWay || isTwoWay(a.subtype), altCode: a.altCode, altName: a.altName, altNameFr: a.altNameFr, parentId: a.parentId, gifi: a.gifi, taxLine: a.taxLine, deductiblePct: a.deductiblePct, debit, credit, balance: r2(natural(a.type, debit, credit)) };
  });
  return includeEmpty ? rows : rows.filter((r) => r.debit !== 0 || r.credit !== 0);
}

export async function trialBalance(db: PrismaClient, entityId: string, asOf: Date) {
  const rows = await accountRows(db, entityId, { to: asOf });
  const debit = r2(rows.reduce((s, r) => s + r.debit, 0));
  const credit = r2(rows.reduce((s, r) => s + r.credit, 0));
  return { rows, debit, credit, balanced: Math.abs(debit - credit) < 0.005 };
}

export async function incomeStatement(db: PrismaClient, entityId: string, from: Date, to: Date) {
  const rows = await accountRows(db, entityId, { from, to });
  const income = rows.filter((r) => r.type === "INCOME");
  const cogs = rows.filter((r) => r.type === "EXPENSE" && r.subtype === "COGS");
  const expenses = rows.filter((r) => r.type === "EXPENSE" && r.subtype !== "COGS");
  const sum = (l: AccountRow[]) => r2(l.reduce((s, r) => s + r.balance, 0));
  const totalIncome = sum(income);
  const totalCogs = sum(cogs);
  const totalExpenses = sum(expenses);
  return { income, cogs, expenses, totalIncome, totalCogs, grossProfit: r2(totalIncome - totalCogs), totalExpenses, netIncome: r2(totalIncome - totalCogs - totalExpenses) };
}

export async function balanceSheet(db: PrismaClient, entityId: string, asOf: Date, fiscalYearStart: Date) {
  const rows = await accountRows(db, entityId, { to: asOf });
  const before = await incomeStatement(db, entityId, new Date(Date.UTC(1990, 0, 1)), new Date(fiscalYearStart.getTime() - 86400000));
  const current = await incomeStatement(db, entityId, fiscalYearStart, asOf);

  // Which accounts may switch sides: those marked as opposite accounts (or under one), and by default every receivable,
  // payable, loan or tax account (a credit balance in a receivable is a liability, a debit balance in a payable an asset).
  // Bank, card, investment, fixed and intangible assets, and the input tax credits that net against a tax payable, stay put.
  const all = await db.accAccount.findMany({ where: { entityId }, select: { id: true, parentId: true, twoWay: true } });
  const meta = new Map(all.map((a) => [a.id, a]));
  const forcedByAncestor = (id: string) => {
    let cur = meta.get(id);
    for (let i = 0; cur?.parentId && i < 6; i++) {
      cur = meta.get(cur.parentId);
      if (cur?.twoWay) return true;
    }
    return false;
  };
  const STAYS = new Set(["BANK", "CREDIT_CARD", "FIXED_ASSET", "INTANGIBLE", "INVESTMENT", "TAX_RECOVERABLE"]);
  const canSwitch = (r: AccountRow) => r.twoWay || forcedByAncestor(r.id) || !STAYS.has(r.subtype);
  const assets: AccountRow[] = [];
  const liabilities: AccountRow[] = [];
  const equity: AccountRow[] = [];
  // An opposite account sits on the side its balance falls on, in the matching section: a loan receivable that
  // turns into a debt moves from assets to liabilities (and back), a tax refund becomes tax owed, and so on.
  // On the other side it takes the number and names chosen for it, and stands on its own in the new section.
  const flipped = (r: AccountRow) => ({ code: r.altCode ?? r.code, name: r.altName ?? r.name, nameFr: r.altNameFr ?? r.altName ?? r.nameFr, parentId: r.altCode || r.altName ? null : r.parentId });
  const toLiability: Record<string, string> = { TREASURY: "SHORT_TERM", CURRENT: "SHORT_TERM", LONG_TERM: "LONG_TERM", FIXED: "LONG_TERM", INTANGIBLE: "LONG_TERM" };
  const toAsset: Record<string, string> = { SHORT_TERM: "CURRENT", LONG_TERM: "LONG_TERM" };
  for (const r of rows) {
    if (r.type === "ASSET") {
      if (canSwitch(r) && r.balance < 0) liabilities.push({ ...r, ...flipped(r), balance: -r.balance, section: toLiability[r.section ?? "CURRENT"] ?? "SHORT_TERM" });
      else assets.push(r);
    } else if (r.type === "LIABILITY") {
      if (canSwitch(r) && r.balance < 0) assets.push({ ...r, ...flipped(r), balance: -r.balance, section: toAsset[r.section ?? "SHORT_TERM"] ?? "CURRENT" });
      else liabilities.push(r);
    } else if (r.type === "EQUITY") equity.push(r);
  }
  const sum = (l: AccountRow[]) => r2(l.reduce((s, r) => s + r.balance, 0));
  const retained = r2(before.netIncome);
  const currentEarnings = r2(current.netIncome);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = r2(sum(equity) + retained + currentEarnings);
  return { assets, liabilities, equity, retained, currentEarnings, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01 };
}

export async function generalLedger(db: PrismaClient, accountId: string, from?: Date, to?: Date) {
  const account = await db.accAccount.findUniqueOrThrow({ where: { id: accountId } });
  const dateFilter = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const opening = from
    ? await db.accJournalLine.aggregate({ where: { accountId, entry: { date: { lt: from } } }, _sum: { debit: true, credit: true } })
    : null;
  const lines = await db.accJournalLine.findMany({
    where: { accountId, ...(from || to ? { entry: { date: dateFilter } } : {}) },
    include: { entry: { select: { id: true, date: true, memo: true, source: true, transactionId: true } } },
    orderBy: [{ entry: { date: "asc" } }, { id: "asc" }],
  });
  const isDebitNormal = account.type === "ASSET" || account.type === "EXPENSE";
  let running = r2(opening ? natural(account.type, opening._sum.debit ?? 0, opening._sum.credit ?? 0) : 0);
  const openingBalance = running;
  const out = lines.map((l) => {
    running = r2(running + (isDebitNormal ? l.debit - l.credit : l.credit - l.debit));
    return { id: l.id, date: l.entry.date, memo: l.memo || l.entry.memo, source: l.entry.source, transactionId: l.entry.transactionId, debit: l.debit, credit: l.credit, balance: running };
  });
  return { account, openingBalance, lines: out };
}

/** Income and expense balances grouped by the tax-return line they belong to (deductible share applied). */
export async function taxSummary(db: PrismaClient, entityId: string, from: Date, to: Date) {
  const rows = await accountRows(db, entityId, { from, to });
  const group = (list: AccountRow[]) => {
    const map = new Map<string, { taxLine: string; amount: number; deductible: number; accounts: string[] }>();
    for (const r of list) {
      const key = r.gifi ? `GIFI ${r.gifi}` : r.taxLine ?? "—";
      const g = map.get(key) ?? { taxLine: key, amount: 0, deductible: 0, accounts: [] };
      g.amount = r2(g.amount + r.balance);
      g.deductible = r2(g.deductible + (r.balance * r.deductiblePct) / 100);
      g.accounts.push(r.name);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.taxLine.localeCompare(b.taxLine, undefined, { numeric: true }));
  };
  const income = group(rows.filter((r) => r.type === "INCOME"));
  const expenses = group(rows.filter((r) => r.type === "EXPENSE"));
  const totalIncome = r2(income.reduce((s, g) => s + g.amount, 0));
  const totalDeductible = r2(expenses.reduce((s, g) => s + g.deductible, 0));
  return { income, expenses, totalIncome, totalDeductible, netBusinessIncome: r2(totalIncome - totalDeductible) };
}

/**
 * GST/HST and QST position: collected on sales, paid on purchases (input tax credits / refunds), remitted, and
 * what is still owed. Sales and the tax collected are the lines of the GST/HST return (101 / 103 / 106 / 109).
 */
export async function salesTaxReport(db: PrismaClient, entityId: string, from: Date, to: Date) {
  const [period, upTo, revenue] = await Promise.all([accountRows(db, entityId, { from, to }), accountRows(db, entityId, { to }), incomeStatement(db, entityId, from, to)]);
  const pick = (rows: AccountRow[], code: string) => rows.find((r) => r.templateCode === code);
  const part = (payableCode: string, recoverableCode: string) => {
    const pay = pick(period, payableCode);
    const rec = pick(period, recoverableCode);
    const payBal = pick(upTo, payableCode);
    const recBal = pick(upTo, recoverableCode);
    const collected = r2(pay?.credit ?? 0);
    const recoverable = r2(rec?.debit ?? 0);
    const remitted = r2(pay?.debit ?? 0);
    // Owing at the end: payable balance (credit) less recoverable balance (debit).
    const owing = r2((payBal ? payBal.credit - payBal.debit : 0) - (recBal ? recBal.debit - recBal.credit : 0));
    return { collected, recoverable, netForPeriod: r2(collected - recoverable), remitted, owing };
  };
  return { sales: revenue.totalIncome, gstHst: part("2300", "2301"), qst: part("2310", "2311") };
}

/**
 * The small-supplier threshold: once taxable revenue passes $30,000 in any four consecutive calendar quarters you
 * must register for GST/QST (and charge it, at the rate of the customer's province: HST in an HST province).
 */
export async function smallSupplierStatus(db: PrismaClient, entityId: string, asOf: Date) {
  const quarterStart = new Date(Date.UTC(asOf.getUTCFullYear(), Math.floor(asOf.getUTCMonth() / 3) * 3, 1));
  const quarters: { label: string; revenue: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const from = new Date(Date.UTC(quarterStart.getUTCFullYear(), quarterStart.getUTCMonth() - 3 * i, 1));
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 3, 0));
    const stmt = await incomeStatement(db, entityId, from, to);
    quarters.push({ label: `${from.getUTCFullYear()} Q${Math.floor(from.getUTCMonth() / 3) + 1}`, revenue: stmt.totalIncome });
  }
  const total = r2(quarters.reduce((s, q) => s + q.revenue, 0));
  return { quarters: quarters.reverse(), total, threshold: 30000, pct: Math.min(100, Math.round((total / 30000) * 100)), exceeded: total > 30000 };
}
