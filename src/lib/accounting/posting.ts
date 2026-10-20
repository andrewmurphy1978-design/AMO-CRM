import { computeCanadianTax } from "@/lib/canadian-tax";
import type { AccType, EntityKind } from "./charts";

// Turns one categorized bank transaction into balanced journal entries — pure code, no database, so the rules of
// the books are easy to test. The caller supplies the entities / accounts involved.
//
// Sign convention: the transaction's amount is normalized — positive = money in (or debt paid down), negative =
// money out (or debt added). In either case the bank account line is a DEBIT when the amount is positive and a
// CREDIT when it is negative (for a card, a purchase adds to the debt = credit; a payment lowers it = debit).

export interface PostEntity {
  id: string;
  name: string;
  kind: EntityKind;
  country: string;
  province: string | null;
  salesTaxRegistered: boolean;
}
export interface PostAccount {
  id: string;
  entityId: string;
  code: string;
  type: AccType;
  subtype: string;
}
export interface AllocationInput {
  entityId: string;
  accountId: string;
  // Absolute amount (tax included when `tax` is set).
  amount: number;
  // Province whose sales-tax rates apply (QC = GST + QST, ON/NB/NL/NS/PE = HST, others = GST). Only honoured
  // when the entity is registered for sales tax.
  tax?: string | null;
}
export interface PostingLine {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string;
}
export interface PostingEntry {
  entityId: string;
  source: "BANK" | "INTERCO";
  memo: string;
  lines: PostingLine[];
}

export interface PostingContext {
  entities: Map<string, PostEntity>;
  accounts: Map<string, PostAccount>;
  // An entity's system account by chart code (sales-tax accounts).
  accountByCode: (entityId: string, code: string) => string | undefined;
  // The account in `entityId`'s books standing for the relationship with `otherEntityId`.
  interco: (entityId: string, otherEntityId: string) => string;
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** GST/HST and QST rates (as fractions) that apply to a sale / purchase for a province. */
export function salesTaxRates(province: string): { gstHst: number; qst: number } {
  const t = computeCanadianTax(1, "Canada", province, true);
  return { gstHst: t.gst + t.hst, qst: t.qst };
}

/** Splits a tax-included amount into the net amount and the tax(es). */
export function splitTax(gross: number, province: string): { net: number; gstHst: number; qst: number } {
  const { gstHst, qst } = salesTaxRates(province);
  const net0 = gross / (1 + gstHst + qst);
  const g = r2(net0 * gstHst);
  const q = r2(net0 * qst);
  return { net: r2(gross - g - q), gstHst: g, qst: q };
}

export function buildPosting(input: {
  tx: { id: string; date: string; amount: number; description: string };
  bank: { id: string; entityId: string };
  allocations: AllocationInput[];
  ctx: PostingContext;
}): PostingEntry[] {
  const { tx, bank, allocations, ctx } = input;
  const inflow = tx.amount > 0;
  const total = r2(Math.abs(tx.amount));
  if (total === 0) throw new Error("A transaction of 0 has nothing to post.");
  const allocated = r2(allocations.reduce((s, a) => s + a.amount, 0));
  if (Math.abs(allocated - total) > 0.01) throw new Error(`The allocations add up to ${allocated.toFixed(2)}, not ${total.toFixed(2)}.`);

  const entries = new Map<string, PostingEntry>();
  const entryFor = (entityId: string, source: PostingEntry["source"]) => {
    const key = `${entityId}:${source}`;
    let e = entries.get(key);
    if (!e) entries.set(key, (e = { entityId, source, memo: tx.description, lines: [] }));
    return e;
  };
  const line = (e: PostingEntry, accountId: string, amount: number, debit: boolean, memo?: string) => {
    const v = r2(amount);
    if (v === 0) return;
    e.lines.push({ accountId, debit: debit ? v : 0, credit: debit ? 0 : v, memo });
  };

  const bankEntry = entryFor(bank.entityId, "BANK");
  line(bankEntry, bank.id, total, inflow);

  for (const a of allocations) {
    const ent = ctx.entities.get(a.entityId);
    const acc = ctx.accounts.get(a.accountId);
    if (!ent || !acc) throw new Error("Unknown entity or account in an allocation.");
    if (acc.entityId !== a.entityId) throw new Error(`The account ${acc.code} does not belong to ${ent.name}.`);
    if (acc.id === bank.id) throw new Error("A transaction cannot be posted to its own bank account.");

    // The counter side, in the entity the money belongs to: credit when money came in, debit when it went out.
    const counterIsDebit = !inflow;
    const home = a.entityId === bank.entityId ? bankEntry : entryFor(a.entityId, "INTERCO");

    if (a.tax && ent.salesTaxRegistered && ent.country === "CA") {
      const s = splitTax(a.amount, a.tax);
      line(home, acc.id, s.net, counterIsDebit);
      // Sales (money in) create tax payable; purchases (money out) create tax recoverable.
      const gstCode = inflow ? "2300" : "1300";
      const qstCode = inflow ? "2310" : "1310";
      const gstAcc = ctx.accountByCode(ent.id, gstCode);
      const qstAcc = ctx.accountByCode(ent.id, qstCode);
      if (s.gstHst > 0) {
        if (!gstAcc) throw new Error(`${ent.name} has no GST/HST account (${gstCode}).`);
        line(home, gstAcc, s.gstHst, counterIsDebit, inflow ? "GST/HST collected" : "GST/HST paid");
      }
      if (s.qst > 0) {
        if (!qstAcc) throw new Error(`${ent.name} has no QST account (${qstCode}).`);
        line(home, qstAcc, s.qst, counterIsDebit, inflow ? "QST collected" : "QST paid");
      }
    } else {
      line(home, acc.id, a.amount, counterIsDebit);
    }

    if (a.entityId !== bank.entityId) {
      // The money moved through another entity's account: each side records what is owed / contributed.
      line(bankEntry, ctx.interco(bank.entityId, a.entityId), a.amount, counterIsDebit);
      line(home, ctx.interco(a.entityId, bank.entityId), a.amount, !counterIsDebit);
    }
  }

  const out = [...entries.values()];
  for (const e of out) {
    const d = r2(e.lines.reduce((s, l) => s + l.debit, 0));
    const c = r2(e.lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(d - c) > 0.005) throw new Error(`Unbalanced entry (${d.toFixed(2)} debits, ${c.toFixed(2)} credits).`);
  }
  return out;
}
