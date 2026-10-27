import type { PrismaClient } from "@/lib/prisma";
import { loadBooks } from "./options";
import { overviewRanges } from "./periods";
import { periodTotals } from "./reports";

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
}

// What the Dashboard's Accounting cards need for one user's books: every entity with its year-to-date / month-to-date
// totals and the transactions still waiting on a category.
export async function getAccountingDashboard(db: PrismaClient, ownerId: string): Promise<EntityDashboard[]> {
  const { entities } = await loadBooks(db, ownerId);
  const out: EntityDashboard[] = [];
  for (const e of entities) {
    const r = overviewRanges(e.fiscalYearEndMonth);
    const [[ytd, mtd], toCategorize, toConfirm, bankAccounts] = await Promise.all([
      periodTotals(db, e.id, [r.ytd, r.mtd]),
      db.accTransaction.count({ where: { status: "NEW", account: { entityId: e.id } } }),
      db.accTransaction.count({ where: { status: "SUGGESTED", account: { entityId: e.id } } }),
      db.accAccount.count({ where: { entityId: e.id, archived: false, subtype: { in: ["BANK", "CREDIT_CARD"] } } }),
    ]);
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
    });
  }
  return out;
}
