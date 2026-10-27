import type { PrismaClient } from "@/lib/prisma";
import { loadBooks } from "./options";
import { overviewRanges } from "./periods";
import { periodTotals } from "./reports";

export interface EntityLink {
  id: string;
  name: string;
  nameFr: string | null;
  otherEntity: string;
  // Positive = the other entity owes this one (asset side) or this one owes it (liability / equity side): the natural balance.
  balance: number;
}

export interface EntityDashboard {
  id: string;
  name: string;
  kind: string;
  currency: string;
  country: string;
  province: string | null;
  salesTaxRegistered: boolean;
  ytd: { income: number; expenses: number; net: number };
  mtd: { income: number; expenses: number; net: number };
  toCategorize: number;
  toConfirm: number;
  bankAccounts: number;
  links: EntityLink[];
}

// What the Dashboard's Accounting cards need for one user's books: every entity with its year-to-date / month-to-date
// totals and the transactions still waiting on a category.
export async function getAccountingDashboard(db: PrismaClient, ownerId: string): Promise<EntityDashboard[]> {
  const { entities } = await loadBooks(db, ownerId);
  const names = new Map(entities.map((e) => [e.id, e.name]));
  const out: EntityDashboard[] = [];
  for (const e of entities) {
    const r = overviewRanges(e.fiscalYearEndMonth);
    const [[ytd, mtd], toCategorize, toConfirm, bankAccounts, linkAccounts] = await Promise.all([
      periodTotals(db, e.id, [r.ytd, r.mtd]),
      db.accTransaction.count({ where: { status: "NEW", account: { entityId: e.id } } }),
      db.accTransaction.count({ where: { status: "SUGGESTED", account: { entityId: e.id } } }),
      db.accAccount.count({ where: { entityId: e.id, archived: false, subtype: { in: ["BANK", "CREDIT_CARD"] } } }),
      db.accAccount.findMany({ where: { entityId: e.id, archived: false, counterEntityId: { not: null } }, orderBy: { code: "asc" }, select: { id: true, name: true, nameFr: true, type: true, counterEntityId: true } }),
    ]);
    const sums = await db.accJournalLine.groupBy({ by: ["accountId"], where: { accountId: { in: linkAccounts.map((a) => a.id) } }, _sum: { debit: true, credit: true } });
    const sumOf = new Map(sums.map((x) => [x.accountId, (x._sum.debit ?? 0) - (x._sum.credit ?? 0)]));
    const links: EntityLink[] = linkAccounts.map((a) => {
      const net = sumOf.get(a.id) ?? 0;
      return { id: a.id, name: a.name, nameFr: a.nameFr, otherEntity: names.get(a.counterEntityId ?? "") ?? "", balance: a.type === "ASSET" || a.type === "EXPENSE" ? net : -net };
    });
    out.push({
      id: e.id,
      name: e.name,
      kind: e.kind,
      currency: e.currency,
      country: e.country,
      province: e.province,
      salesTaxRegistered: e.salesTaxRegistered,
      ytd,
      mtd,
      toCategorize,
      toConfirm,
      bankAccounts,
      links,
    });
  }
  return out;
}
