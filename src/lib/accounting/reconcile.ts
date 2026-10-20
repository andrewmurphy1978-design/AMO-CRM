import type { PrismaClient } from "@/lib/prisma";
import { r2 } from "./posting";
import { supplierKey } from "./supplier";

// Month-end reconciliation of a bank / credit-card account against its statement. Everything is in the account's
// own currency. A credit card's balance is what is owed (a purchase raises it, a payment lowers it).

export interface ReconcileTx {
  id: string;
  date: string;
  supplier: string;
  description: string;
  amount: number;
  status: string;
}

export interface ReconcileSummary {
  accountId: string;
  isCard: boolean;
  currency: string;
  periodStart: string;
  periodEnd: string;
  opening: number;
  moneyIn: number;
  moneyOut: number;
  computed: number;
  hasOpeningEntry: boolean;
  firstTxDate: string | null;
  txs: ReconcileTx[];
  uncategorized: number;
  lockedThrough: string | null;
  reconciled: { id: string; statementBalance: number } | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) };
}

export async function lockedThrough(db: PrismaClient, accountId: string): Promise<Date | null> {
  const last = await db.accReconciliation.findFirst({ where: { accountId }, orderBy: { periodEnd: "desc" }, select: { periodEnd: true } });
  return last?.periodEnd ?? null;
}

/** Throws when one of the transactions sits in a month already reconciled and locked. */
export async function assertUnlocked(db: PrismaClient, txIds: string[]): Promise<void> {
  if (txIds.length === 0) return;
  const txs = await db.accTransaction.findMany({ where: { id: { in: txIds } }, select: { accountId: true, date: true } });
  const cache = new Map<string, Date | null>();
  for (const t of txs) {
    if (!cache.has(t.accountId)) cache.set(t.accountId, await lockedThrough(db, t.accountId));
    const lock = cache.get(t.accountId);
    if (lock && t.date <= lock) throw new Error(`The month ending ${iso(lock)} is reconciled and locked. Unlock it in Reconcile first.`);
  }
}

export async function reconcileSummary(db: PrismaClient, accountId: string, month: string): Promise<ReconcileSummary> {
  const account = await db.accAccount.findUniqueOrThrow({ where: { id: accountId }, include: { entity: true } });
  const isCard = account.subtype === "CREDIT_CARD";
  const { start, end } = monthRange(month);

  // Opening balances and manual entries on the account itself (everything else comes from the transactions).
  const base = await db.accJournalLine.aggregate({
    where: { accountId, entry: { source: { in: ["OPENING", "MANUAL"] }, date: { lte: end } } },
    _sum: { debit: true, credit: true },
  });
  const baseBalance = isCard ? (base._sum.credit ?? 0) - (base._sum.debit ?? 0) : (base._sum.debit ?? 0) - (base._sum.credit ?? 0);
  const hasOpeningEntry = (await db.accJournalLine.count({ where: { accountId, entry: { source: "OPENING" } } })) > 0;

  const [before, period, first, lock, reconciled] = await Promise.all([
    db.accTransaction.aggregate({ where: { accountId, date: { lt: start } }, _sum: { amount: true } }),
    db.accTransaction.findMany({ where: { accountId, date: { gte: start, lte: end } }, orderBy: [{ date: "asc" }, { id: "asc" }], select: { id: true, date: true, supplier: true, description: true, amount: true, status: true } }),
    db.accTransaction.findFirst({ where: { accountId }, orderBy: { date: "asc" }, select: { date: true } }),
    lockedThrough(db, accountId),
    db.accReconciliation.findUnique({ where: { accountId_periodEnd: { accountId, periodEnd: end } }, select: { id: true, statementBalance: true } }),
  ]);
  const signed = (n: number) => (isCard ? -n : n);
  const opening = r2(baseBalance + signed(before._sum.amount ?? 0));
  const moneyIn = r2(period.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
  const moneyOut = r2(period.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const computed = r2(opening + signed(moneyIn + moneyOut));
  return {
    accountId,
    isCard,
    currency: account.currency ?? account.entity.currency,
    periodStart: iso(start),
    periodEnd: iso(end),
    opening,
    moneyIn,
    moneyOut,
    computed,
    hasOpeningEntry,
    firstTxDate: first ? iso(first.date) : null,
    txs: period.map((t) => ({ id: t.id, date: iso(t.date), supplier: t.supplier, description: t.description, amount: t.amount, status: t.status })),
    uncategorized: period.filter((t) => t.status === "NEW" || t.status === "SUGGESTED").length,
    lockedThrough: lock ? iso(lock) : null,
    reconciled,
  };
}

/** Likely reasons for a difference between the statement and the computed balance. */
export function differenceHints(txs: ReconcileTx[], difference: number, isCard: boolean, lang: "en" | "fr"): string[] {
  const fr = lang === "fr";
  const hints: string[] = [];
  const d = r2(Math.abs(difference));
  if (d < 0.005) return hints;
  // On a card, the balance moves the opposite way to the signed amounts.
  const impact = (t: ReconcileTx) => r2(isCard ? -t.amount : t.amount);
  for (const t of txs) {
    if (Math.abs(impact(t)) === d) {
      hints.push(
        fr
          ? `${t.date} ${t.supplier} (${t.amount.toFixed(2)}) a exactement le montant de l'écart : elle est peut-être en double dans le CRM ou manquante sur le relevé.`
          : `${t.date} ${t.supplier} (${t.amount.toFixed(2)}) is exactly the difference: it may be duplicated in the CRM or missing from the statement.`
      );
    } else if (Math.abs(impact(t)) * 2 === d) {
      hints.push(fr ? `${t.date} ${t.supplier} : le signe est peut-être inversé (écart = 2 × ${Math.abs(t.amount).toFixed(2)}).` : `${t.date} ${t.supplier}: the sign may be reversed (difference = 2 × ${Math.abs(t.amount).toFixed(2)}).`);
    }
  }
  const groups = new Map<string, ReconcileTx[]>();
  for (const t of txs) {
    const k = `${t.date}|${t.amount}|${supplierKey(t.supplier)}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  for (const g of groups.values()) if (g.length > 1) hints.push(fr ? `${g.length} transactions identiques le ${g[0].date} : ${g[0].supplier} ${g[0].amount.toFixed(2)} — vérifiez qu'il ne s'agit pas d'un doublon.` : `${g.length} identical transactions on ${g[0].date}: ${g[0].supplier} ${g[0].amount.toFixed(2)} — check it is not a duplicate.`);
  if (hints.length === 0) hints.push(fr ? "Aucune cause évidente : comparez le relevé ligne par ligne avec la liste ci-dessous, et vérifiez le solde d'ouverture." : "No obvious cause: compare the statement line by line with the list below, and check the opening balance.");
  return hints;
}
