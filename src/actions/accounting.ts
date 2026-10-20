"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import {
  allocationsFromRule,
  applyRules,
  byTemplate,
  keyOf,
  createBankAccount,
  createEntity,
  ensureAccountingSetup,
  importTransactions,
  postTransactions,
  saveRule,
  unpostTransactions,
  type ImportRow,
  type RuleAllocation,
} from "@/lib/accounting/ledger";
import type { EntityKind } from "@/lib/accounting/charts";
import { r2 } from "@/lib/accounting/posting";
import { suggestForSuppliers, keywordAccountCode, readPdfStatement, type AiAccountOption } from "@/lib/accounting/ai";
import { defaultSection, suggestGifi, usesGifi } from "@/lib/accounting/charts";
import { parseTaxNumbers } from "@/lib/accounting/tax-numbers";
import { accountingUserFor, type AccountingUser } from "@/lib/accounting/access";
import { assertUnlocked, monthRange, reconcileSummary } from "@/lib/accounting/reconcile";
import { supplierName, supplierKey } from "@/lib/accounting/supplier";

// Accounting holds personal bank data: admins, and team members who were given access. Each user has their own
// books, so every id received from the browser is checked to belong to the signed-in user before it is used.
async function access(): Promise<AccountingUser> {
  const session = await auth();
  const me = await withScopedPrismaClient((db) => accountingUserFor(db, session));
  if (!me) throw new Error("Accounting is not enabled for your account");
  return me;
}

type Db = import("@/lib/prisma").PrismaClient;
const deny = () => new Error("Not found");
function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
async function ownEntity(db: Db, me: AccountingUser, id: string) {
  if (!id || (await db.accEntity.count({ where: { id, ownerId: me.id } })) === 0) throw deny();
}
async function ownAccount(db: Db, me: AccountingUser, id: string) {
  if (!id || (await db.accAccount.count({ where: { id, entity: { ownerId: me.id } } })) === 0) throw deny();
}
async function ownTxIds(db: Db, me: AccountingUser, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  return (await db.accTransaction.findMany({ where: { id: { in: ids }, account: { entity: { ownerId: me.id } } }, select: { id: true } })).map((t) => t.id);
}

// "" or the entity's own currency means "same as the entity" (stored as null by the caller's comparison below).
function cleanCurrency(v: FormDataEntryValue | null): string | undefined {
  const c = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : undefined;
}

const refresh = () => revalidatePath("/accounting", "layout");

type Result = { error?: string; success?: string };

// ---------------------------------------------------------------- setup

export async function setupAccounting(): Promise<void> {
  const me = await access();
  await withScopedPrismaClient((db) => ensureAccountingSetup(db, me));
  refresh();
}

export async function addEntity(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const me = await access();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as EntityKind;
  if (!name) return { error: "Enter a name." };
  if (!["PERSONAL", "SOLE_PROPRIETORSHIP", "CORPORATION", "LLC"].includes(kind)) return { error: "Choose a type." };
  if (!me.admin) return { error: "Your account has personal accounting only." };
  await withScopedPrismaClient((db) =>
    createEntity(db, {
      ownerId: me.id,
      name,
      kind,
      province: String(formData.get("province") ?? "").trim() || undefined,
      taxNumbers: parseTaxNumbers(formData),
      salesTaxRegistered: formData.get("salesTaxRegistered") === "on",
      fiscalYearEndMonth: Number(formData.get("fiscalYearEndMonth") ?? 12) || 12,
    })
  );
  refresh();
  return { success: "Entity created with its chart of accounts." };
}

export async function updateEntity(id: string, _prev: Result | undefined, formData: FormData): Promise<Result> {
  const me = await access();
  await withScopedPrismaClient(async (db) => {
    await ownEntity(db, me, id);
    return db.accEntity.update({
      where: { id },
      data: {
        name: String(formData.get("name") ?? "").trim() || undefined,
        province: String(formData.get("province") ?? "").trim() || null,
        taxNumber: null,
        taxNumbers: parseTaxNumbers(formData) as never,
        salesTaxRegistered: formData.get("salesTaxRegistered") === "on",
        basis: String(formData.get("basis") ?? "CASH") === "ACCRUAL" ? "ACCRUAL" : "CASH",
        fiscalYearEndMonth: Number(formData.get("fiscalYearEndMonth") ?? 12) || 12,
      },
    });
  });
  refresh();
  return { success: "Saved." };
}

export async function addBankAccount(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const me = await access();
  const entityId = String(formData.get("entityId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "CHEQUING");
  if (!entityId || !name) return { error: "Choose whose account it is and name it." };
  await withScopedPrismaClient(async (db) => {
    await ownEntity(db, me, entityId);
    return createBankAccount(db, {
      entityId,
      name,
      kind,
      institution: String(formData.get("institution") ?? "").trim() || undefined,
      last4: String(formData.get("last4") ?? "").trim() || undefined,
      importSign: formData.get("invertSign") === "on" ? -1 : 1,
      currency: cleanCurrency(formData.get("currency")),
      nameFr: String(formData.get("nameFr") ?? "").trim() || undefined,
    });
  });
  refresh();
  return { success: "Account added." };
}

export async function updateBankAccount(id: string, _prev: Result | undefined, formData: FormData): Promise<Result> {
  const me = await access();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name." };
  await withScopedPrismaClient(async (db) => {
    await ownAccount(db, me, id);
    return db.accAccount.update({
      where: { id },
      data: {
        name,
        institution: String(formData.get("institution") ?? "").trim() || null,
        last4: String(formData.get("last4") ?? "").trim() || null,
        importSign: formData.get("invertSign") === "on" ? -1 : 1,
        currency: cleanCurrency(formData.get("currency")),
        nameFr: String(formData.get("nameFr") ?? "").trim() || null,
      },
    });
  });
  refresh();
  return { success: "Saved." };
}

export async function deleteBankAccount(id: string): Promise<Result> {
  const me = await access();
  const result = await withScopedPrismaClient(async (db) => {
    await ownAccount(db, me, id);
    const [txs, lines] = await Promise.all([db.accTransaction.count({ where: { accountId: id } }), db.accJournalLine.count({ where: { accountId: id } })]);
    if (txs > 0 || lines > 0) return { error: "This account has transactions, so it cannot be deleted. You can edit its details instead." };
    await db.accImportBatch.deleteMany({ where: { accountId: id } });
    await db.accAccount.delete({ where: { id } });
    return {};
  });
  refresh();
  return result;
}

// A new account in a Canadian business entity gets the suggested GIFI code unless one was typed.
async function autoGifi(db: import("@/lib/prisma").PrismaClient, entityId: string, code: string, name: string, type: string, subtype: string): Promise<string | null> {
  const e = await db.accEntity.findUnique({ where: { id: entityId } });
  return e && usesGifi(e.kind, e.country) ? suggestGifi(e.kind, { code, name, type, subtype }) : null;
}

// Income and expenses nest three deep under their card (group > account > sub-account); assets and liabilities
// one deep (their section is the level above).
const maxDepth = (type: string) => (type === "INCOME" || type === "EXPENSE" ? 2 : 1);
async function ancestorCount(db: Db, id: string): Promise<number> {
  let n = 0;
  let cur = await db.accAccount.findUnique({ where: { id }, select: { parentId: true } });
  while (cur?.parentId && n < 5) {
    n++;
    cur = await db.accAccount.findUnique({ where: { id: cur.parentId }, select: { parentId: true } });
  }
  return n;
}
async function subtreeHeight(db: Db, id: string): Promise<number> {
  const kids = await db.accAccount.findMany({ where: { parentId: id }, select: { id: true } });
  let h = 0;
  for (const k of kids) h = Math.max(h, 1 + (await subtreeHeight(db, k.id)));
  return h;
}

async function validParent(db: import("@/lib/prisma").PrismaClient, entityId: string, type: string, parentId: string): Promise<string | null> {
  if (!parentId) return null;
  const p = await db.accAccount.findUnique({ where: { id: parentId } });
  if (!p || p.entityId !== entityId || p.type !== type) return null;
  return (await ancestorCount(db, p.id)) + 1 <= maxDepth(type) ? p.id : null;
}

// The balance-sheet section chosen for a new account sets the subtype that places it there.
function sectionSubtype(section: string, type: string): string {
  if (type === "ASSET") return ({ LONG_TERM: "INVESTMENT", FIXED: "FIXED_ASSET", INTANGIBLE: "INTANGIBLE" } as Record<string, string>)[section] ?? "OTHER";
  if (type === "LIABILITY") return section === "LONG_TERM" ? "LOAN" : "PAYABLE";
  return "OTHER";
}

export async function setAccountSection(id: string, section: string | null): Promise<void> {
  const me = await access();
  const valid = ["TREASURY", "CURRENT", "LONG_TERM", "FIXED", "INTANGIBLE", "SHORT_TERM"];
  await withScopedPrismaClient(async (db) => { await ownAccount(db, me, id); const next = section && valid.includes(section) ? section : null; await db.accAccount.updateMany({ where: { parentId: id }, data: { section: next } }); return db.accAccount.update({ where: { id }, data: { section: next } }); });
  refresh();
}

/** Makes an account a sub-category of another (same entity and type, one level), or a top-level account again. */
export async function setAccountParent(id: string, parentId: string | null): Promise<Result> {
  const me = await access();
  const result = await withScopedPrismaClient(async (db) => {
    await ownAccount(db, me, id);
    if (parentId) await ownAccount(db, me, parentId);
    const acc = await db.accAccount.findUniqueOrThrow({ where: { id } });
    if (parentId) {
      const parent = await db.accAccount.findUniqueOrThrow({ where: { id: parentId } });
      if (parent.id === acc.id) return { error: "An account cannot be its own parent." };
      if (parent.entityId !== acc.entityId || parent.type !== acc.type) return { error: "A sub-category must be in the same entity and of the same type as its parent." };
      if ((parent.type === "ASSET" || parent.type === "LIABILITY") && (parent.section ?? defaultSection(parent.type, parent.subtype)) !== (acc.section ?? defaultSection(acc.type, acc.subtype))) return { error: "A second-level account must be in the same section as the account above it." };
      // The parent must not be one of this account's own descendants, and the whole branch must stay within the depth.
      let up: string | null = parent.parentId;
      while (up) {
        if (up === acc.id) return { error: "An account cannot be placed under one of its own sub-accounts." };
        up = (await db.accAccount.findUnique({ where: { id: up }, select: { parentId: true } }))?.parentId ?? null;
      }
      const depthOfParent = (await ancestorCount(db, parent.id)) + 1;
      if (depthOfParent + (await subtreeHeight(db, acc.id)) + 0 > maxDepth(acc.type)) return { error: acc.type === "INCOME" || acc.type === "EXPENSE" ? "Income and expenses go three levels deep (group, account, sub-account)." : "Only one level of sub-categories is supported for this type." };
      if (acc.subtype === "BANK" || acc.subtype === "CREDIT_CARD") return { error: "Bank and card accounts cannot be sub-categories." };
    }
    await db.accAccount.update({ where: { id }, data: { parentId } });
    return {};
  });
  refresh();
  return result;
}

/** Renumbers an account. The system keeps finding it by its template code, so sales taxes, opening balances etc. keep working. */
export async function setAccountCode(id: string, code: string): Promise<Result> {
  const me = await access();
  const next = code.trim();
  if (!/^\d{3,6}$/.test(next)) return { error: "A code is 3 to 6 digits." };
  try {
    const out = await withScopedPrismaClient(async (db) => {
      await ownAccount(db, me, id);
      const acc = await db.accAccount.findUniqueOrThrow({ where: { id } });
      if (acc.code === next) return {};
      await db.accAccount.update({ where: { id }, data: { code: next, templateCode: keyOf(acc) } });
      return {};
    });
    refresh();
    return out;
  } catch (error) {
    if (error instanceof Error && error.message === "Not found") throw error;
    return { error: "That code is already used in this entity's chart." };
  }
}

/** Makes an account an opposite account (or not) and sets the number and names it takes on the other side of the balance sheet. */
export async function saveOppositeAccount(id: string, input: { twoWay: boolean; altCode: string; altName: string; altNameFr: string }): Promise<Result> {
  const me = await access();
  const altCode = input.altCode.trim();
  if (altCode && !/^\d{3,6}$/.test(altCode)) return { error: "A code is 3 to 6 digits." };
  const out = await withScopedPrismaClient(async (db) => {
    await ownAccount(db, me, id);
    const acc = await db.accAccount.findUniqueOrThrow({ where: { id } });
    if (acc.type !== "ASSET" && acc.type !== "LIABILITY") throw deny();
    if (altCode) {
      const clash = await db.accAccount.findFirst({ where: { entityId: acc.entityId, id: { not: id }, OR: [{ code: altCode }, { altCode }] }, select: { code: true } });
      if (clash) return { error: "That number is already used by another account of this entity." };
    }
    await db.accAccount.update({
      where: { id },
      data: { twoWay: input.twoWay, altCode: input.twoWay ? altCode || null : null, altName: input.twoWay ? input.altName.trim() || null : null, altNameFr: input.twoWay ? input.altNameFr.trim() || null : null },
    });
    return { success: "Saved." };
  });
  refresh();
  return out;
}

// Accounts the books themselves rely on (sales taxes, opening-balance equity...): they cannot be removed.
const REQUIRED_KEYS = new Set(["2300", "2301", "2310", "2311", "3000", "3200"]);

/**
 * Removes an account that has no transactions or entries. Accounts of the standard chart are archived (renumbered out
 * of the way) rather than deleted so they are not created again; the user's own accounts are deleted.
 */
export async function deleteAccount(id: string): Promise<Result> {
  const me = await access();
  const out = await withScopedPrismaClient(async (db) => {
    await ownAccount(db, me, id);
    const acc = await db.accAccount.findUniqueOrThrow({ where: { id } });
    if (REQUIRED_KEYS.has(keyOf(acc)) || acc.counterEntityId) return { error: "The books need this account (sales taxes, opening balances or a link with another entity), so it cannot be removed." };
    const [lines, txs, kids, recs] = await Promise.all([
      db.accJournalLine.count({ where: { accountId: id } }),
      db.accTransaction.count({ where: { accountId: id } }),
      db.accAccount.count({ where: { parentId: id, archived: false } }),
      db.accReconciliation.count({ where: { accountId: id } }),
    ]);
    if (lines > 0 || txs > 0 || recs > 0) return { error: "This account has transactions, so it cannot be removed." };
    if (kids > 0) return { error: "This account has sub-accounts: move or remove them first." };
    // Remembered suppliers that pointed at it are forgotten.
    const rules = await db.accRule.findMany({ where: { ownerId: me.id }, select: { id: true, allocations: true } });
    const stale = rules.filter((r) => ((r.allocations as { accountId?: string }[] | null) ?? []).some((a) => a.accountId === id)).map((r) => r.id);
    if (stale.length > 0) await db.accRule.deleteMany({ where: { id: { in: stale } } });
    if (acc.templateCode || acc.isSystem) {
      await db.accImportBatch.deleteMany({ where: { accountId: id } });
      await db.accAccount.update({ where: { id }, data: { archived: true, templateCode: keyOf(acc), code: `${acc.code}~${id.slice(-5)}`, parentId: null } });
    } else {
      await db.accImportBatch.deleteMany({ where: { accountId: id } });
      await db.accAccount.delete({ where: { id } });
    }
    return {};
  });
  refresh();
  return out;
}

export async function setAccountNames(id: string, name: string, nameFr: string): Promise<Result> {
  const me = await access();
  if (!name.trim()) return { error: "The English name cannot be empty." };
  await withScopedPrismaClient(async (db) => { await ownAccount(db, me, id); return db.accAccount.update({ where: { id }, data: { name: name.trim(), nameFr: nameFr.trim() || null } }); });
  refresh();
  return {};
}

export async function setAccountGifi(id: string, gifi: string): Promise<Result> {
  const me = await access();
  const code = gifi.trim();
  if (code && !/^\d{4}$/.test(code)) return { error: "A GIFI code has 4 digits." };
  await withScopedPrismaClient(async (db) => { await ownAccount(db, me, id); return db.accAccount.update({ where: { id }, data: { gifi: code || null } }); });
  refresh();
  return {};
}

export async function addAccount(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const me = await access();
  const entityId = String(formData.get("entityId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "EXPENSE");
  if (!entityId || !code || !name) return { error: "Enter a code and a name." };
  if (!["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"].includes(type)) return { error: "Choose a type." };
  try {
    await withScopedPrismaClient(async (db) => {
      await ownEntity(db, me, entityId);
      const parentId = await validParent(db, entityId, type, String(formData.get("parentId") ?? ""));
      const parent = parentId ? await db.accAccount.findUnique({ where: { id: parentId } }) : null;
      // A second-level account lives in its parent's balance-sheet section.
      const chosen = String(formData.get("section") ?? "");
      const section = type === "ASSET" || type === "LIABILITY" ? (parent ? parent.section ?? defaultSection(parent.type, parent.subtype) : chosen || defaultSection(type, sectionSubtype(chosen, type))) : null;
      return db.accAccount.create({
        data: { entityId, code, name, nameFr: String(formData.get("nameFr") ?? "").trim() || null, section, twoWay: (type === "ASSET" || type === "LIABILITY") && formData.get("twoWay") === "on", type: type as "ASSET", subtype: type === "EXPENSE" ? "OPERATING" : type === "INCOME" ? "REVENUE" : sectionSubtype(String(formData.get("section") ?? ""), type), taxLine: String(formData.get("taxLine") ?? "").trim() || null, gifi: /^\d{4}$/.test(String(formData.get("gifi") ?? "").trim()) ? String(formData.get("gifi")).trim() : await autoGifi(db, entityId, code, name, type, sectionSubtype(String(formData.get("section") ?? ""), type)), parentId },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Not found") throw error;
    return { error: "That code is already used in this entity's chart." };
  }
  refresh();
  return { success: "Account added." };
}

/** Sets the exchange rate of not-yet-categorized transactions in a foreign-currency account. */
export async function setFxRate(txIds: string[], rate: number): Promise<Result> {
  const me = await access();
  if (!(rate > 0)) return { error: "Enter a rate above 0." };
  await withScopedPrismaClient(async (db) => { const ids = await ownTxIds(db, me, txIds); return db.accTransaction.updateMany({ where: { id: { in: ids }, status: { in: ["NEW", "SUGGESTED"] } }, data: { fxRate: rate } }); });
  refresh();
  return { success: "Rate saved." };
}

export async function deleteRule(id: string): Promise<void> {
  const me = await access();
  await withScopedPrismaClient((db) => db.accRule.deleteMany({ where: { id, ownerId: me.id } }));
  refresh();
}

// ---------------------------------------------------------------- import

export async function importStatement(accountId: string, rows: ImportRow[], fileName: string, fxRate = 1, format?: { signature: string; map: unknown } | null): Promise<Result & { counts?: { rows: number; added: number; duplicates: number; dateMismatches: number; autoPosted: number; transfersLinked: number; skipped: { date: string; description: string; amount: number; reason: "duplicate" | "swapped" }[] } }> {
  const me = await access();
  if (rows.length === 0) return { error: "There is nothing to import." };
  if (rows.length > 20000) return { error: "That file is too large — import it in parts." };
  try {
    const counts = await withScopedPrismaClient(async (db) => {
      await ownAccount(db, me, accountId);
      const c = await importTransactions(db, accountId, rows, fileName, fxRate);
      // Remember how this account's statements are laid out (columns, date order) for the next import.
      if (format) await db.accAccount.update({ where: { id: accountId }, data: { importFormat: format as never } });
      return c;
    });
    refresh();
    return { success: "Imported.", counts };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The import failed." };
  }
}

// A PDF statement: the AI reads it and returns the rows for the user to check before importing.
export async function readStatementPdf(accountId: string, base64: string): Promise<{ rows?: ImportRow[]; warning?: string; error?: string }> {
  const me = await access();
  if (base64.length > 9_000_000) return { error: "That PDF is too large (max about 6 MB)." };
  return withScopedPrismaClient(async (db) => {
    await ownAccount(db, me, accountId);
    const account = await db.accAccount.findUniqueOrThrow({ where: { id: accountId } });
    const out = await readPdfStatement(db, base64, account.subtype === "CREDIT_CARD" ? "CREDIT_CARD" : "BANK");
    if ("error" in out) return { error: out.error };
    // importTransactions applies the account's sign setting, so the rows are sent back as read.
    return { rows: out.rows, warning: out.warning };
  });
}

// ---------------------------------------------------------------- categorizing

export type AllocationPayload = { entityId: string; accountId: string; pct?: number; amount?: number; tax?: string | null };

/**
 * Posts the given transactions to the books. With `remember`, every supplier among them is remembered, and all the
 * other not-yet-categorized transactions of those suppliers (already imported or imported later) are categorized
 * the same way.
 */
export async function categorizeTransactions(input: { txIds: string[]; allocations: AllocationPayload[]; remember: boolean }): Promise<Result & { posted?: number; autoPosted?: number }> {
  const me = await access();
  if (input.txIds.length === 0 || input.allocations.length === 0) return { error: "Choose an account." };
  const byPct = input.allocations.every((a) => typeof a.pct === "number");
  if (byPct && Math.abs(input.allocations.reduce((s, a) => s + (a.pct ?? 0), 0) - 100) > 0.01) return { error: "The percentages must add up to 100." };
  if (!byPct && input.txIds.length > 1) return { error: "Splitting by amount works on one transaction at a time." };

  return withScopedPrismaClient(async (db) => {
    // Every transaction and every account chosen must belong to this user.
    const ownIds = await ownTxIds(db, me, input.txIds);
    const chosen = [...new Set(input.allocations.map((a) => a.accountId))];
    const ownChosen = await db.accAccount.findMany({ where: { id: { in: chosen }, subtype: { not: "GROUP" }, entity: { ownerId: me.id } }, select: { id: true, entityId: true } });
    const entityOf = new Map(ownChosen.map((a) => [a.id, a.entityId]));
    if (ownChosen.length !== chosen.length || input.allocations.some((a) => entityOf.get(a.accountId) !== a.entityId)) throw deny();
    const txs = await db.accTransaction.findMany({ where: { id: { in: ownIds } } });
    const items = txs.map((t) => {
      const total = r2(Math.abs(t.amount));
      const allocations = byPct
        ? allocationsFromRule(input.allocations.map((a) => ({ entityId: a.entityId, accountId: a.accountId, pct: a.pct as number, tax: a.tax ?? null })), t.amount)
        : input.allocations.map((a) => ({ entityId: a.entityId, accountId: a.accountId, amount: r2(a.amount ?? 0), tax: a.tax ?? null }));
      return { txId: t.id, allocations, total, by: "USER" as const };
    });
    const res = await postTransactions(db, items);
    if (res.errors.length > 0) return { error: res.errors[0].message, posted: res.posted };

    let autoPosted = 0;
    if (input.remember) {
      // Always remembered as percentages, so the rule fits any amount from that supplier.
      const first = txs[0];
      const pctRule: RuleAllocation[] = byPct
        ? input.allocations.map((a) => ({ entityId: a.entityId, accountId: a.accountId, pct: a.pct as number, tax: a.tax ?? null }))
        : input.allocations.map((a) => ({ entityId: a.entityId, accountId: a.accountId, pct: r2(((a.amount ?? 0) / Math.abs(first.amount)) * 100), tax: a.tax ?? null }));
      const seen = new Set<string>();
      for (const t of txs) {
        const key = supplierKey(t.supplier);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        await saveRule(db, me.id, t.supplier, pctRule);
      }
      autoPosted = (await applyRules(db, me.id)).posted;
    }
    refresh();
    return { success: "Categorized.", posted: res.posted, autoPosted };
  });
}

/** Removes an import and its transactions (posted ones are first taken out of the books). */
export async function deleteImportBatch(batchId: string): Promise<void> {
  const me = await access();
  await withScopedPrismaClient(async (db) => {
    if ((await db.accImportBatch.count({ where: { id: batchId, account: { entity: { ownerId: me.id } } } })) === 0) throw deny();
    const ids = (await db.accTransaction.findMany({ where: { batchId }, select: { id: true } })).map((t) => t.id);
    await assertUnlocked(db, ids);
    await unpostTransactions(db, ids);
    await db.accTransaction.deleteMany({ where: { batchId } });
    await db.accImportBatch.delete({ where: { id: batchId } });
  });
  refresh();
}

export async function uncategorizeTransactions(txIds: string[]): Promise<void> {
  const me = await access();
  await withScopedPrismaClient(async (db) => unpostTransactions(db, await ownTxIds(db, me, txIds)));
  refresh();
}

export async function ignoreTransactions(allIds: string[], ignore: boolean): Promise<void> {
  const me = await access();
  await withScopedPrismaClient(async (db) => {
    const txIds = await ownTxIds(db, me, allIds);
    await assertUnlocked(db, txIds);
    if (ignore) {
      await unpostTransactions(db, txIds);
      await db.accTransaction.updateMany({ where: { id: { in: txIds } }, data: { status: "IGNORED" } });
    } else {
      await db.accTransaction.updateMany({ where: { id: { in: txIds }, status: "IGNORED" }, data: { status: "NEW" } });
    }
  });
  refresh();
}

export async function updateSupplier(txId: string, name: string): Promise<void> {
  const me = await access();
  const clean = name.trim();
  if (!clean) return;
  await withScopedPrismaClient(async (db) => {
    if ((await ownTxIds(db, me, [txId])).length === 0) throw deny();
    const tx = await db.accTransaction.findUniqueOrThrow({ where: { id: txId } });
    // Renaming applies to every not-yet-categorized transaction of the same supplier.
    await db.accTransaction.updateMany({ where: { supplier: tx.supplier, status: { in: ["NEW", "SUGGESTED"] }, account: { entity: { ownerId: me.id } } }, data: { supplier: clean } });
    await db.accTransaction.update({ where: { id: txId }, data: { supplier: clean } });
    await applyRules(db, me.id);
  });
  refresh();
}

export async function deleteTransactions(allIds: string[]): Promise<void> {
  const me = await access();
  await withScopedPrismaClient(async (db) => {
    const txIds = await ownTxIds(db, me, allIds);
    await assertUnlocked(db, txIds);
    await unpostTransactions(db, txIds);
    await db.accTransaction.deleteMany({ where: { id: { in: txIds } } });
  });
  refresh();
}

// ---------------------------------------------------------------- AI suggestions

/** Suggests a categorization for every supplier that has none yet (one AI call per 30 suppliers). */
export async function suggestWithAI(): Promise<Result & { suggested?: number }> {
  const me = await access();
  try {
    return await withScopedPrismaClient(async (db) => {
      const open = await db.accTransaction.findMany({ where: { status: { in: ["NEW", "SUGGESTED"] }, account: { entity: { ownerId: me.id } } }, select: { id: true, accountId: true, supplier: true, description: true, amount: true } });
      if (open.length === 0) return { success: "Nothing to categorize.", suggested: 0 };
      const groups = new Map<string, { name: string; sample: string; amount: number; count: number; ids: string[]; from: Set<string> }>();
      for (const t of open) {
        const g = groups.get(t.supplier) ?? { name: t.supplier, sample: t.description, amount: t.amount, count: 0, ids: [], from: new Set<string>() };
        g.count++;
        g.ids.push(t.id);
        g.from.add(t.accountId);
        groups.set(t.supplier, g);
      }
      const accounts = await db.accAccount.findMany({ where: { archived: false, subtype: { not: "GROUP" }, entity: { ownerId: me.id } }, include: { entity: true }, orderBy: [{ entityId: "asc" }, { code: "asc" }] });
      const options: AiAccountOption[] = accounts
        .filter((a) => !a.entity.archived)
        .map((a) => ({ id: a.id, entityId: a.entityId, entityName: a.entity.name, entityKind: a.entity.kind, code: a.code, name: a.name, type: a.type }));
      // Fixed keyword rules first (convenience stores, vets...), the AI for the rest.
      const personal = accounts.find((a) => a.entity.kind === "PERSONAL");
      const forced = new Map<string, { accountId: string; entityId: string }>();
      for (const g of groups.values()) {
        const code = keywordAccountCode(`${g.name} ${g.sample}`);
        const acc = code && personal ? accounts.find((a) => a.entityId === personal.entityId && keyOf(a) === code) : null;
        if (acc) forced.set(g.name, { accountId: acc.id, entityId: acc.entityId });
      }
      const rest = [...groups.values()].filter((g) => !forced.has(g.name));
      const found = new Map(forced);
      if (rest.length > 0) for (const [k, v] of await suggestForSuppliers(db, rest.map(({ name, sample, amount, count }) => ({ name, sample, amount, count })), options)) found.set(k, v);
      let suggested = 0;
      const assigned = new Set<string>();
      for (const [supplier, pick] of found) {
        const g = groups.get(supplier);
        if (!g) continue;
        // The account the money moved in is never the answer: a transfer goes to the other account.
        if (g.from.has(pick.accountId)) continue;
        assigned.add(supplier);
        await db.accTransaction.updateMany({ where: { id: { in: g.ids } }, data: { status: "SUGGESTED", suggestion: { source: "AI", allocations: [{ entityId: pick.entityId, accountId: pick.accountId, pct: 100 }] } } });
        suggested += g.ids.length;
      }
      // Old suggestions that no longer hold (e.g. pointing at the transaction's own account) are cleared.
      const stale = [...groups.values()].filter((g) => !assigned.has(g.name)).flatMap((g) => g.ids);
      if (stale.length > 0) await db.accTransaction.updateMany({ where: { id: { in: stale }, status: "SUGGESTED" }, data: { status: "NEW", suggestion: undefined } });
      refresh();
      return { success: `${suggested} transaction(s) have a suggestion to confirm.`, suggested };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The AI suggestions failed." };
  }
}

/** Posts the AI / rule suggestions of the given transactions (and remembers each supplier). */
export async function confirmSuggestions(txIds: string[]): Promise<Result & { posted?: number }> {
  const me = await access();
  return withScopedPrismaClient(async (db) => {
    const txs = await db.accTransaction.findMany({ where: { id: { in: await ownTxIds(db, me, txIds) }, status: "SUGGESTED" } });
    const items = txs.flatMap((t) => {
      const s = t.suggestion as { allocations?: RuleAllocation[] } | null;
      if (!s?.allocations?.length) return [];
      return [{ txId: t.id, by: "AI" as const, allocations: allocationsFromRule(s.allocations, t.amount) }];
    });
    const res = await postTransactions(db, items);
    const failed = new Set(res.errors.map((e) => e.txId));
    // Only what actually posted is remembered for that supplier.
    for (const t of txs) {
      const s = t.suggestion as { allocations?: RuleAllocation[] } | null;
      if (s?.allocations?.length && !failed.has(t.id)) await saveRule(db, me.id, t.supplier, s.allocations);
    }
    const auto = await applyRules(db, me.id);
    // A suggestion that cannot be posted is dropped, so the transaction goes back to "to categorize" with no wrong suggestion.
    if (failed.size > 0) await db.accTransaction.updateMany({ where: { id: { in: [...failed] } }, data: { status: "NEW", suggestion: undefined } });
    refresh();
    if (failed.size > 0) return { error: `${failed.size} suggestion(s) could not be posted (${res.errors[0].message}). Categorize them by hand.`, posted: res.posted + auto.posted };
    return { success: "Confirmed.", posted: res.posted + auto.posted };
  });
}

// ---------------------------------------------------------------- manual entries

export async function addManualEntry(input: { entityId: string; date: string; memo: string; opening?: boolean; lines: { accountId: string; debit: number; credit: number }[] }): Promise<Result> {
  const me = await access();
  const lines = input.lines.map((l) => ({ ...l, debit: r2(Math.max(0, l.debit || 0)), credit: r2(Math.max(0, l.credit || 0)) })).filter((l) => l.debit > 0 || l.credit > 0);
  const d = r2(lines.reduce((s, l) => s + l.debit, 0));
  const c = r2(lines.reduce((s, l) => s + l.credit, 0));
  if (lines.length < 2) return { error: "An entry needs at least two lines." };
  if (Math.abs(d - c) > 0.005) return { error: `Debits (${d.toFixed(2)}) and credits (${c.toFixed(2)}) must be equal.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Enter a valid date." };
  try {
    await withScopedPrismaClient(async (db) => {
      await ownEntity(db, me, input.entityId);
      const accs = await db.accAccount.findMany({ where: { id: { in: lines.map((l) => l.accountId) } }, select: { entityId: true, subtype: true } });
      if (accs.some((a) => a.subtype === "GROUP")) throw new Error("A sub-category header cannot be used in an entry: choose an account under it.");
      if (accs.some((a) => a.entityId !== input.entityId)) throw new Error("Every line must use an account of the same entity.");
      await db.accJournalEntry.create({
        data: { entityId: input.entityId, date: new Date(`${input.date}T00:00:00.000Z`), memo: input.memo, source: input.opening ? "OPENING" : "MANUAL", lines: { create: lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })) } },
      });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the entry." };
  }
  refresh();
  return { success: "Entry saved." };
}

export async function deleteManualEntry(id: string): Promise<void> {
  const me = await access();
  await withScopedPrismaClient((db) => db.accJournalEntry.deleteMany({ where: { id, transactionId: null, entity: { ownerId: me.id } } }));
  refresh();
}

// ---------------------------------------------------------------- reconciliation

/** Locks the month once the statement balance equals what the CRM computed. */
export async function reconcileMonth(input: { accountId: string; month: string; statementBalance: number; notes?: string }): Promise<Result> {
  const me = await access();
  if (!/^\d{4}-\d{2}$/.test(input.month) || !Number.isFinite(input.statementBalance)) return { error: "Enter the statement's closing balance." };
  try {
    const out = await withScopedPrismaClient(async (db) => {
      await ownAccount(db, me, input.accountId);
      const sum = await reconcileSummary(db, input.accountId, input.month);
      if (Math.abs(r2(input.statementBalance) - sum.computed) > 0.005) return { error: "The balances do not match yet." };
      if (sum.lockedThrough && sum.lockedThrough > sum.periodEnd) return { error: "A later month is already reconciled: unlock it first." };
      const periodEnd = monthRange(input.month).end;
      await db.accReconciliation.upsert({
        where: { accountId_periodEnd: { accountId: input.accountId, periodEnd } },
        update: { statementBalance: r2(input.statementBalance), computedBalance: sum.computed, notes: input.notes || null },
        create: { accountId: input.accountId, periodEnd, statementBalance: r2(input.statementBalance), computedBalance: sum.computed, notes: input.notes || null },
      });
      return {};
    });
    refresh();
    return out.error ? out : { success: "Month reconciled and locked." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not reconcile." };
  }
}

/** Reopens the latest reconciled month. */
export async function unlockReconciliation(id: string): Promise<Result> {
  const me = await access();
  const result = await withScopedPrismaClient(async (db) => {
    const rec = await db.accReconciliation.findFirstOrThrow({ where: { id, account: { entity: { ownerId: me.id } } } });
    const later = await db.accReconciliation.count({ where: { accountId: rec.accountId, periodEnd: { gt: rec.periodEnd } } });
    if (later > 0) return { error: "Unlock the later months first (latest first)." };
    await db.accReconciliation.delete({ where: { id } });
    return {};
  });
  refresh();
  return result;
}

/** Records the account's balance on a date as an opening-balance entry (against the entity's opening-balance equity). */
export async function setOpeningBalance(input: { accountId: string; date: string; amount: number }): Promise<Result> {
  const me = await access();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(input.amount)) return { error: "Enter a date and a balance." };
  const amount = r2(input.amount);
  if (amount === 0) return { error: "The balance is zero: nothing to record." };
  try {
    await withScopedPrismaClient(async (db) => {
      await ownAccount(db, me, input.accountId);
      const acc = await db.accAccount.findUniqueOrThrow({ where: { id: input.accountId } });
      if (await db.accJournalLine.count({ where: { accountId: acc.id, entry: { source: "OPENING" } } })) throw new Error("This account already has an opening balance (see Journal).");
      const equity = await db.accAccount.findFirst({ where: { entityId: acc.entityId, ...byTemplate("3000") } });
      if (!equity) throw new Error("The entity has no opening-balance account (3000).");
      const card = acc.subtype === "CREDIT_CARD";
      // Bank: debit the account when money is there. Card: credit the account when money is owed.
      const accountDebit = card ? amount < 0 : amount > 0;
      const abs = Math.abs(amount);
      await db.accJournalEntry.create({
        data: {
          entityId: acc.entityId,
          date: new Date(`${input.date}T00:00:00.000Z`),
          memo: `Opening balance — ${acc.name}`,
          source: "OPENING",
          lines: { create: [{ accountId: acc.id, debit: accountDebit ? abs : 0, credit: accountDebit ? 0 : abs }, { accountId: equity.id, debit: accountDebit ? 0 : abs, credit: accountDebit ? abs : 0 }] },
        },
      });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save." };
  }
  refresh();
  return { success: "Opening balance saved." };
}

/**
 * Records the market gain (or loss) that explains the difference between an investment account's statement balance
 * and the CRM's computed balance, as a manual entry dated at the end of the month (against an "Investment gains and
 * losses" income account, created the first time it is needed).
 */
export async function recordInvestmentAdjustment(input: { accountId: string; month: string; amount: number }): Promise<Result> {
  const me = await access();
  if (!/^\d{4}-\d{2}$/.test(input.month) || !Number.isFinite(input.amount)) return { error: "Enter an amount." };
  const amount = r2(input.amount);
  if (amount === 0) return { error: "There is no difference to record." };
  try {
    await withScopedPrismaClient(async (db) => {
      await ownAccount(db, me, input.accountId);
      const acc = await db.accAccount.findUniqueOrThrow({ where: { id: input.accountId } });
      if (!acc.registeredType) throw new Error("Only investment and registered accounts take a gain / loss adjustment.");
      const { end } = monthRange(input.month);
      const lock = await db.accReconciliation.findFirst({ where: { accountId: acc.id }, orderBy: { periodEnd: "desc" }, select: { periodEnd: true } });
      if (lock && lock.periodEnd >= end) throw new Error("This month is reconciled and locked: unlock it first.");
      let gain = await db.accAccount.findFirst({ where: { entityId: acc.entityId, subtype: "INVESTMENT_GAIN" } });
      if (!gain) {
        const used = new Set((await db.accAccount.findMany({ where: { entityId: acc.entityId, code: { gte: "4800", lte: "4899" } }, select: { code: true } })).map((a) => a.code));
        let code = 4800;
        while (used.has(String(code)) && code < 4899) code++;
        gain = await db.accAccount.create({ data: { entityId: acc.entityId, code: String(code), name: "Investment gains and losses", nameFr: "Gains et pertes de placement", type: "INCOME", subtype: "INVESTMENT_GAIN", isSystem: true } });
      }
      const abs = Math.abs(amount);
      // Gain: the account grows (debit) against income (credit). Loss: the reverse.
      await db.accJournalEntry.create({
        data: {
          entityId: acc.entityId,
          date: end,
          memo: `Investment ${amount > 0 ? "gain" : "loss"} — ${acc.name} (${input.month})`,
          source: "MANUAL",
          lines: { create: [{ accountId: acc.id, debit: amount > 0 ? abs : 0, credit: amount > 0 ? 0 : abs }, { accountId: gain.id, debit: amount > 0 ? 0 : abs, credit: amount > 0 ? abs : 0 }] },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Not found") throw error;
    return { error: error instanceof Error ? error.message : "Could not save." };
  }
  refresh();
  return { success: "Adjustment recorded." };
}

/** Other posted transactions of the same supplier, split into those that can be moved and those in a reconciled (locked) month. */
async function findSimilar(db: Db, me: AccountingUser, tx: { id: string; supplier: string }) {
  const key = supplierKey(tx.supplier);
  if (!key) return { movable: [] as { id: string; accountId: string; amount: number; allocations: unknown }[], locked: 0 };
  const candidates = await db.accTransaction.findMany({
    where: { id: { not: tx.id }, status: "POSTED", matchedTransactionId: null, account: { entity: { ownerId: me.id } } },
    select: { id: true, accountId: true, amount: true, supplier: true, date: true, allocations: true },
  });
  const locks = new Map<string, Date | null>();
  const movable: { id: string; accountId: string; amount: number; allocations: unknown }[] = [];
  let locked = 0;
  for (const c of candidates) {
    if (supplierKey(c.supplier) !== key) continue;
    if (!locks.has(c.accountId)) {
      const l = await db.accReconciliation.findFirst({ where: { accountId: c.accountId }, orderBy: { periodEnd: "desc" }, select: { periodEnd: true } });
      locks.set(c.accountId, l?.periodEnd ?? null);
    }
    const lock = locks.get(c.accountId);
    if (lock && c.date <= lock) locked++;
    else movable.push({ id: c.id, accountId: c.accountId, amount: c.amount, allocations: c.allocations });
  }
  return { movable, locked };
}

export async function countSimilarTransactions(txId: string): Promise<{ count: number; locked: number }> {
  const me = await access();
  return withScopedPrismaClient(async (db) => {
    if ((await ownTxIds(db, me, [txId])).length === 0) throw deny();
    const tx = await db.accTransaction.findUniqueOrThrow({ where: { id: txId }, select: { id: true, supplier: true } });
    const { movable, locked } = await findSimilar(db, me, tx);
    return { count: movable.length, locked };
  });
}

/**
 * Moves an already-categorized transaction to another category (from the General Ledger). The old posting is
 * replaced; a transfer's other half is reopened first and linked again if the new category is a transfer too.
 */
export async function recategorizeTransaction(input: { txId: string; entityId: string; accountId: string; tax: boolean; remember: boolean; applyToSimilar?: boolean }): Promise<Result> {
  const me = await access();
  try {
    return await withScopedPrismaClient(async (db) => {
      const ids = await ownTxIds(db, me, [input.txId]);
      if (ids.length === 0) throw deny();
      await assertUnlocked(db, ids);
      const tx = await db.accTransaction.findUniqueOrThrow({ where: { id: input.txId } });
      const target = await db.accAccount.findFirst({ where: { id: input.accountId, entityId: input.entityId, subtype: { not: "GROUP" }, entity: { ownerId: me.id } }, include: { entity: true } });
      if (!target) throw deny();
      if (target.id === tx.accountId) return { error: "A transaction cannot be categorized to its own bank account." };
      const linked = await db.accTransaction.findMany({ where: { matchedTransactionId: tx.id }, select: { id: true } });
      if (linked.length > 0) await db.accTransaction.updateMany({ where: { id: { in: linked.map((l) => l.id) } }, data: { status: "NEW", categorizedBy: null, matchedTransactionId: null } });
      const taxProvince = input.tax && target.entity.salesTaxRegistered ? target.entity.province ?? "QC" : null;
      const res = await postTransactions(db, [{ txId: tx.id, by: "USER", allocations: allocationsFromRule([{ entityId: target.entityId, accountId: target.id, pct: 100, tax: taxProvince }], tx.amount) }]);
      if (res.errors.length > 0) {
        // Nothing was replaced: put the other half back.
        if (linked.length > 0) await db.accTransaction.updateMany({ where: { id: { in: linked.map((l) => l.id) } }, data: { status: "POSTED", categorizedBy: "USER", matchedTransactionId: tx.id } });
        return { error: res.errors[0].message };
      }
      if (input.remember) {
        await saveRule(db, me.id, tx.supplier, [{ entityId: target.entityId, accountId: target.id, pct: 100, tax: taxProvince }]);
        await applyRules(db, me.id);
      }
      // The same change for the supplier's other already-categorized transactions.
      let moved = 0;
      let skipped = 0;
      if (input.applyToSimilar) {
        const { movable, locked } = await findSimilar(db, me, tx);
        skipped += locked;
        const todo = movable.filter((m) => {
          if (m.accountId === target.id) return false; // a transaction never goes to its own bank account
          const a = (m.allocations as { accountId?: string }[] | null) ?? [];
          return !(a.length === 1 && a[0].accountId === target.id); // already there
        });
        if (todo.length > 0) {
          const ids2 = todo.map((m) => m.id);
          const linked2 = await db.accTransaction.findMany({ where: { matchedTransactionId: { in: ids2 } }, select: { id: true } });
          if (linked2.length > 0) await db.accTransaction.updateMany({ where: { id: { in: linked2.map((l) => l.id) } }, data: { status: "NEW", categorizedBy: null, matchedTransactionId: null } });
          const r2res = await postTransactions(db, todo.map((m) => ({ txId: m.id, by: "USER" as const, allocations: allocationsFromRule([{ entityId: target.entityId, accountId: target.id, pct: 100, tax: taxProvince }], m.amount) })));
          moved = r2res.posted;
          skipped += r2res.errors.length;
        }
      }
      refresh();
      return { success: input.applyToSimilar ? `Recategorized, and ${moved} similar transaction(s) moved too${skipped ? ` (${skipped} left as they were: locked month or an error)` : ""}.` : "Recategorized." };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Not found") throw error;
    return { error: error instanceof Error ? error.message : "Could not recategorize." };
  }
}

/**
 * Sets the opening balances of an entity's asset and liability accounts on a date. Each non-zero balance is one
 * opening entry against the entity's opening-balance equity account; a blank or zero balance removes the account's
 * opening entry. Positive = the account's normal balance (money in an asset, money owed on a liability).
 */
export async function saveOpeningBalances(input: { entityId: string; date: string; balances: { accountId: string; amount: number }[] }): Promise<Result> {
  const me = await access();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Enter the date of the opening balances." };
  try {
    const saved = await withScopedPrismaClient(async (db) => {
      await ownEntity(db, me, input.entityId);
      const entity = await db.accEntity.findUniqueOrThrow({ where: { id: input.entityId } });
      const ids = input.balances.map((b) => b.accountId);
      const accs = await db.accAccount.findMany({ where: { id: { in: ids }, entityId: input.entityId, type: { in: ["ASSET", "LIABILITY"] }, subtype: { not: "GROUP" } } });
      const byId = new Map(accs.map((a) => [a.id, a]));
      // Corporations open against retained earnings, everyone else against the opening-balance equity account.
      const equity = (entity.kind === "CORPORATION" ? await db.accAccount.findFirst({ where: { entityId: entity.id, ...byTemplate("3200") } }) : null) ?? (await db.accAccount.findFirst({ where: { entityId: entity.id, ...byTemplate("3000") } }));
      if (!equity) throw new Error("The entity has no opening-balance account.");
      const date = new Date(`${input.date}T00:00:00.000Z`);
      let count = 0;
      for (const b of input.balances) {
        const acc = byId.get(b.accountId);
        if (!acc) continue;
        await db.accJournalEntry.deleteMany({ where: { entityId: entity.id, source: "OPENING", lines: { some: { accountId: acc.id } } } });
        const amount = Number.isFinite(b.amount) ? r2(b.amount) : 0;
        if (amount === 0) continue;
        // Asset: debit when positive. Liability: credit when positive.
        const accountDebit = acc.type === "ASSET" ? amount > 0 : amount < 0;
        const abs = Math.abs(amount);
        await db.accJournalEntry.create({
          data: {
            entityId: entity.id,
            date,
            memo: `Opening balance — ${acc.name}`,
            source: "OPENING",
            lines: { create: [{ accountId: acc.id, debit: accountDebit ? abs : 0, credit: accountDebit ? 0 : abs }, { accountId: equity.id, debit: accountDebit ? 0 : abs, credit: accountDebit ? abs : 0 }] },
          },
        });
        count++;
      }
      return count;
    });
    refresh();
    return { success: `${saved} opening balance(s) saved.` };
  } catch (error) {
    if (error instanceof Error && error.message === "Not found") throw error;
    return { error: error instanceof Error ? error.message : "Could not save." };
  }
}

/** Adds a transaction that is missing from the imports (e.g. found while reconciling). It goes to "to categorize", or is categorized by a remembered supplier. */
export async function addManualTransaction(input: { accountId: string; date: string; description: string; amount: number; direction: "in" | "out" }): Promise<Result> {
  const me = await access();
  const description = input.description.trim();
  if (!description) return { error: "Enter a description." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Enter a valid date." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { error: "Enter an amount above 0." };
  const amount = r2(input.direction === "in" ? input.amount : -input.amount);
  try {
    const out = await withScopedPrismaClient(async (db) => {
      await ownAccount(db, me, input.accountId);
      const date = new Date(`${input.date}T00:00:00.000Z`);
      const lock = await db.accReconciliation.findFirst({ where: { accountId: input.accountId }, orderBy: { periodEnd: "desc" }, select: { periodEnd: true } });
      if (lock && date <= lock.periodEnd) return { error: `The month ending ${lock.periodEnd.toISOString().slice(0, 10)} is reconciled and locked: unlock it first.` };
      const tx = await db.accTransaction.create({
        data: { accountId: input.accountId, date, description, supplier: supplierName(description), amount, dedupeKey: `manual-${crypto.randomUUID()}`, notes: "Added by hand" },
      });
      const auto = await applyRules(db, me.id, [tx.id]);
      return { success: auto.posted > 0 ? "Transaction added and categorized from a remembered supplier." : "Transaction added: it is in Transactions, to categorize." };
    });
    refresh();
    return out;
  } catch (error) {
    if (error instanceof Error && error.message === "Not found") throw error;
    return { error: error instanceof Error ? error.message : "Could not add the transaction." };
  }
}

/**
 * Moves every journal line of one account to another account of the same entity (e.g. all of 1900 to 1901 once 1901
 * exists). The transactions keep their categorization, now pointing at the new account; remembered suppliers that
 * pointed at the old one follow, and a relationship account hands its link with the other entity over.
 */
export async function moveAccountTransactions(input: { fromId: string; toId: string; updateRules: boolean }): Promise<Result> {
  const me = await access();
  try {
    const out = await withScopedPrismaClient(async (db) => {
      await ownAccount(db, me, input.fromId);
      await ownAccount(db, me, input.toId);
      if (input.fromId === input.toId) return { error: "Choose a different account." };
      const [from, to] = await Promise.all([db.accAccount.findUniqueOrThrow({ where: { id: input.fromId } }), db.accAccount.findUniqueOrThrow({ where: { id: input.toId } })]);
      if (from.entityId !== to.entityId) return { error: "Both accounts must belong to the same entity." };
      if (from.subtype === "GROUP" || to.subtype === "GROUP") return { error: "A sub-category header cannot hold transactions." };
      if (["BANK", "CREDIT_CARD"].includes(from.subtype) || ["BANK", "CREDIT_CARD"].includes(to.subtype)) return { error: "Bank and card accounts cannot be merged this way." };
      // Transactions whose categorization touched the old account (their "allocations" are updated too).
      const entries = await db.accJournalEntry.findMany({ where: { entityId: from.entityId, transactionId: { not: null }, lines: { some: { accountId: from.id } } }, select: { transactionId: true } });
      const txIds = [...new Set(entries.map((e) => e.transactionId as string))];
      const moved = await db.accJournalLine.updateMany({ where: { accountId: from.id }, data: { accountId: to.id } });
      for (const c of chunks(txIds, 200)) {
        const txs = await db.accTransaction.findMany({ where: { id: { in: c } }, select: { id: true, allocations: true } });
        for (const t of txs) {
          const a = t.allocations as { accountId?: string }[] | null;
          if (a?.some((x) => x.accountId === from.id)) await db.accTransaction.update({ where: { id: t.id }, data: { allocations: a.map((x) => (x.accountId === from.id ? { ...x, accountId: to.id } : x)) as never } });
        }
      }
      if (input.updateRules) {
        const rules = await db.accRule.findMany({ where: { ownerId: me.id }, select: { id: true, allocations: true } });
        for (const r of rules) {
          const a = r.allocations as { accountId?: string }[] | null;
          if (a?.some((x) => x.accountId === from.id)) await db.accRule.update({ where: { id: r.id }, data: { allocations: a.map((x) => (x.accountId === from.id ? { ...x, accountId: to.id } : x)) as never } });
        }
      }
      // A relationship account (money between entities) hands its link over so new postings use the new one.
      if (from.counterEntityId && !to.counterEntityId) {
        await db.accAccount.update({ where: { id: from.id }, data: { counterEntityId: null } });
        await db.accAccount.update({ where: { id: to.id }, data: { counterEntityId: from.counterEntityId } });
      }
      return { success: `${moved.count} line(s) moved from ${from.code} to ${to.code}.` };
    });
    refresh();
    return out;
  } catch (error) {
    if (error instanceof Error && error.message === "Not found") throw error;
    return { error: error instanceof Error ? error.message : "Could not move the transactions." };
  }
}

/** Chooses the account of an entity's books that holds the money going to / from another entity (a loan to or from it). */
export async function setRelationshipAccount(entityId: string, otherId: string, accountId: string | null): Promise<Result> {
  const me = await access();
  try {
    await withScopedPrismaClient(async (db) => {
      await ownEntity(db, me, entityId);
      await ownEntity(db, me, otherId);
      if (entityId === otherId) throw deny();
      await db.accAccount.updateMany({ where: { entityId, counterEntityId: otherId }, data: { counterEntityId: null } });
      if (accountId) {
        const acc = await db.accAccount.findFirst({ where: { id: accountId, entityId, subtype: { notIn: ["GROUP", "BANK", "CREDIT_CARD"] }, type: { in: ["ASSET", "LIABILITY", "EQUITY"] } } });
        if (!acc) throw deny();
        await db.accAccount.update({ where: { id: acc.id }, data: { counterEntityId: otherId } });
      }
    });
    refresh();
    return { success: "Saved." };
  } catch (error) {
    if (error instanceof Error && error.message === "Not found") throw error;
    return { error: error instanceof Error ? error.message : "Could not save." };
  }
}
