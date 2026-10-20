"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import {
  allocationsFromRule,
  applyRules,
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
import { parseTaxNumbers } from "@/lib/accounting/tax-numbers";
import { supplierKey } from "@/lib/accounting/supplier";

// Accounting holds personal bank data: admin only, like every other stored secret in this app.
async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") throw new Error("Only admins can use Accounting");
  return session;
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
  await requireAdmin();
  await withScopedPrismaClient((db) => ensureAccountingSetup(db));
  refresh();
}

export async function addEntity(_prev: Result | undefined, formData: FormData): Promise<Result> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as EntityKind;
  if (!name) return { error: "Enter a name." };
  if (!["PERSONAL", "SOLE_PROPRIETORSHIP", "CORPORATION", "LLC"].includes(kind)) return { error: "Choose a type." };
  await withScopedPrismaClient((db) =>
    createEntity(db, {
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
  await requireAdmin();
  await withScopedPrismaClient((db) =>
    db.accEntity.update({
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
    })
  );
  refresh();
  return { success: "Saved." };
}

export async function addBankAccount(_prev: Result | undefined, formData: FormData): Promise<Result> {
  await requireAdmin();
  const entityId = String(formData.get("entityId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "CHEQUING") as "CHEQUING" | "SAVINGS" | "CREDIT_CARD";
  if (!entityId || !name) return { error: "Choose whose account it is and name it." };
  await withScopedPrismaClient((db) =>
    createBankAccount(db, {
      entityId,
      name,
      kind,
      institution: String(formData.get("institution") ?? "").trim() || undefined,
      last4: String(formData.get("last4") ?? "").trim() || undefined,
      importSign: formData.get("invertSign") === "on" ? -1 : 1,
      currency: cleanCurrency(formData.get("currency")),
      nameFr: String(formData.get("nameFr") ?? "").trim() || undefined,
    })
  );
  refresh();
  return { success: "Account added." };
}

export async function updateBankAccount(id: string, _prev: Result | undefined, formData: FormData): Promise<Result> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name." };
  await withScopedPrismaClient((db) =>
    db.accAccount.update({
      where: { id },
      data: {
        name,
        institution: String(formData.get("institution") ?? "").trim() || null,
        last4: String(formData.get("last4") ?? "").trim() || null,
        importSign: formData.get("invertSign") === "on" ? -1 : 1,
        currency: cleanCurrency(formData.get("currency")),
        nameFr: String(formData.get("nameFr") ?? "").trim() || null,
      },
    })
  );
  refresh();
  return { success: "Saved." };
}

export async function deleteBankAccount(id: string): Promise<Result> {
  await requireAdmin();
  const result = await withScopedPrismaClient(async (db) => {
    const [txs, lines] = await Promise.all([db.accTransaction.count({ where: { accountId: id } }), db.accJournalLine.count({ where: { accountId: id } })]);
    if (txs > 0 || lines > 0) return { error: "This account has transactions, so it cannot be deleted. You can edit its details instead." };
    await db.accImportBatch.deleteMany({ where: { accountId: id } });
    await db.accAccount.delete({ where: { id } });
    return {};
  });
  refresh();
  return result;
}

export async function addAccount(_prev: Result | undefined, formData: FormData): Promise<Result> {
  await requireAdmin();
  const entityId = String(formData.get("entityId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "EXPENSE");
  if (!entityId || !code || !name) return { error: "Enter a code and a name." };
  if (!["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"].includes(type)) return { error: "Choose a type." };
  try {
    await withScopedPrismaClient((db) =>
      db.accAccount.create({
        data: { entityId, code, name, type: type as "ASSET", subtype: type === "EXPENSE" ? "OPERATING" : type === "INCOME" ? "REVENUE" : "OTHER", taxLine: String(formData.get("taxLine") ?? "").trim() || null },
      })
    );
  } catch {
    return { error: "That code is already used in this entity's chart." };
  }
  refresh();
  return { success: "Account added." };
}

/** Sets the exchange rate of not-yet-categorized transactions in a foreign-currency account. */
export async function setFxRate(txIds: string[], rate: number): Promise<Result> {
  await requireAdmin();
  if (!(rate > 0)) return { error: "Enter a rate above 0." };
  await withScopedPrismaClient((db) => db.accTransaction.updateMany({ where: { id: { in: txIds }, status: { in: ["NEW", "SUGGESTED"] } }, data: { fxRate: rate } }));
  refresh();
  return { success: "Rate saved." };
}

export async function deleteRule(id: string): Promise<void> {
  await requireAdmin();
  await withScopedPrismaClient((db) => db.accRule.delete({ where: { id } }));
  refresh();
}

// ---------------------------------------------------------------- import

export async function importStatement(accountId: string, rows: ImportRow[], fileName: string, fxRate = 1, format?: { signature: string; map: unknown } | null): Promise<Result & { counts?: { rows: number; added: number; duplicates: number; dateMismatches: number; autoPosted: number; transfersLinked: number } }> {
  await requireAdmin();
  if (rows.length === 0) return { error: "There is nothing to import." };
  if (rows.length > 20000) return { error: "That file is too large — import it in parts." };
  try {
    const counts = await withScopedPrismaClient(async (db) => {
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
  await requireAdmin();
  if (base64.length > 9_000_000) return { error: "That PDF is too large (max about 6 MB)." };
  return withScopedPrismaClient(async (db) => {
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
  await requireAdmin();
  if (input.txIds.length === 0 || input.allocations.length === 0) return { error: "Choose an account." };
  const byPct = input.allocations.every((a) => typeof a.pct === "number");
  if (byPct && Math.abs(input.allocations.reduce((s, a) => s + (a.pct ?? 0), 0) - 100) > 0.01) return { error: "The percentages must add up to 100." };
  if (!byPct && input.txIds.length > 1) return { error: "Splitting by amount works on one transaction at a time." };

  return withScopedPrismaClient(async (db) => {
    const txs = await db.accTransaction.findMany({ where: { id: { in: input.txIds } } });
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
        await saveRule(db, t.supplier, pctRule);
      }
      autoPosted = (await applyRules(db)).posted;
    }
    refresh();
    return { success: "Categorized.", posted: res.posted, autoPosted };
  });
}

/** Removes an import and its transactions (posted ones are first taken out of the books). */
export async function deleteImportBatch(batchId: string): Promise<void> {
  await requireAdmin();
  await withScopedPrismaClient(async (db) => {
    const ids = (await db.accTransaction.findMany({ where: { batchId }, select: { id: true } })).map((t) => t.id);
    await unpostTransactions(db, ids);
    await db.accTransaction.deleteMany({ where: { batchId } });
    await db.accImportBatch.delete({ where: { id: batchId } });
  });
  refresh();
}

export async function uncategorizeTransactions(txIds: string[]): Promise<void> {
  await requireAdmin();
  await withScopedPrismaClient((db) => unpostTransactions(db, txIds));
  refresh();
}

export async function ignoreTransactions(txIds: string[], ignore: boolean): Promise<void> {
  await requireAdmin();
  await withScopedPrismaClient(async (db) => {
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
  await requireAdmin();
  const clean = name.trim();
  if (!clean) return;
  await withScopedPrismaClient(async (db) => {
    const tx = await db.accTransaction.findUniqueOrThrow({ where: { id: txId } });
    // Renaming applies to every not-yet-categorized transaction of the same supplier.
    await db.accTransaction.updateMany({ where: { supplier: tx.supplier, status: { in: ["NEW", "SUGGESTED"] } }, data: { supplier: clean } });
    await db.accTransaction.update({ where: { id: txId }, data: { supplier: clean } });
    await applyRules(db);
  });
  refresh();
}

export async function deleteTransactions(txIds: string[]): Promise<void> {
  await requireAdmin();
  await withScopedPrismaClient(async (db) => {
    await unpostTransactions(db, txIds);
    await db.accTransaction.deleteMany({ where: { id: { in: txIds } } });
  });
  refresh();
}

// ---------------------------------------------------------------- AI suggestions

/** Suggests a categorization for every supplier that has none yet (one AI call per 30 suppliers). */
export async function suggestWithAI(): Promise<Result & { suggested?: number }> {
  await requireAdmin();
  try {
    return await withScopedPrismaClient(async (db) => {
      const open = await db.accTransaction.findMany({ where: { status: { in: ["NEW", "SUGGESTED"] } }, select: { id: true, supplier: true, description: true, amount: true } });
      if (open.length === 0) return { success: "Nothing to categorize.", suggested: 0 };
      const groups = new Map<string, { name: string; sample: string; amount: number; count: number; ids: string[] }>();
      for (const t of open) {
        const g = groups.get(t.supplier) ?? { name: t.supplier, sample: t.description, amount: t.amount, count: 0, ids: [] };
        g.count++;
        g.ids.push(t.id);
        groups.set(t.supplier, g);
      }
      const accounts = await db.accAccount.findMany({ where: { archived: false }, include: { entity: true }, orderBy: [{ entityId: "asc" }, { code: "asc" }] });
      const options: AiAccountOption[] = accounts
        .filter((a) => !a.entity.archived)
        .map((a) => ({ id: a.id, entityId: a.entityId, entityName: a.entity.name, entityKind: a.entity.kind, code: a.code, name: a.name, type: a.type }));
      // Fixed keyword rules first (convenience stores, vets...), the AI for the rest.
      const personal = accounts.find((a) => a.entity.kind === "PERSONAL");
      const forced = new Map<string, { accountId: string; entityId: string }>();
      for (const g of groups.values()) {
        const code = keywordAccountCode(`${g.name} ${g.sample}`);
        const acc = code && personal ? accounts.find((a) => a.entityId === personal.entityId && a.code === code) : null;
        if (acc) forced.set(g.name, { accountId: acc.id, entityId: acc.entityId });
      }
      const rest = [...groups.values()].filter((g) => !forced.has(g.name));
      const found = new Map(forced);
      if (rest.length > 0) for (const [k, v] of await suggestForSuppliers(db, rest.map(({ name, sample, amount, count }) => ({ name, sample, amount, count })), options)) found.set(k, v);
      let suggested = 0;
      for (const [supplier, pick] of found) {
        const g = groups.get(supplier);
        if (!g) continue;
        await db.accTransaction.updateMany({ where: { id: { in: g.ids } }, data: { status: "SUGGESTED", suggestion: { source: "AI", allocations: [{ entityId: pick.entityId, accountId: pick.accountId, pct: 100 }] } } });
        suggested += g.ids.length;
      }
      refresh();
      return { success: `${suggested} transaction(s) have a suggestion to confirm.`, suggested };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The AI suggestions failed." };
  }
}

/** Posts the AI / rule suggestions of the given transactions (and remembers each supplier). */
export async function confirmSuggestions(txIds: string[]): Promise<Result & { posted?: number }> {
  await requireAdmin();
  return withScopedPrismaClient(async (db) => {
    const txs = await db.accTransaction.findMany({ where: { id: { in: txIds }, status: "SUGGESTED" } });
    const items = txs.flatMap((t) => {
      const s = t.suggestion as { allocations?: RuleAllocation[] } | null;
      if (!s?.allocations?.length) return [];
      return [{ txId: t.id, by: "AI" as const, allocations: allocationsFromRule(s.allocations, t.amount) }];
    });
    const res = await postTransactions(db, items);
    for (const t of txs) {
      const s = t.suggestion as { allocations?: RuleAllocation[] } | null;
      if (s?.allocations?.length) await saveRule(db, t.supplier, s.allocations);
    }
    const auto = await applyRules(db);
    refresh();
    return { success: "Confirmed.", posted: res.posted + auto.posted };
  });
}

// ---------------------------------------------------------------- manual entries

export async function addManualEntry(input: { entityId: string; date: string; memo: string; opening?: boolean; lines: { accountId: string; debit: number; credit: number }[] }): Promise<Result> {
  await requireAdmin();
  const lines = input.lines.map((l) => ({ ...l, debit: r2(Math.max(0, l.debit || 0)), credit: r2(Math.max(0, l.credit || 0)) })).filter((l) => l.debit > 0 || l.credit > 0);
  const d = r2(lines.reduce((s, l) => s + l.debit, 0));
  const c = r2(lines.reduce((s, l) => s + l.credit, 0));
  if (lines.length < 2) return { error: "An entry needs at least two lines." };
  if (Math.abs(d - c) > 0.005) return { error: `Debits (${d.toFixed(2)}) and credits (${c.toFixed(2)}) must be equal.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Enter a valid date." };
  try {
    await withScopedPrismaClient(async (db) => {
      const accs = await db.accAccount.findMany({ where: { id: { in: lines.map((l) => l.accountId) } }, select: { entityId: true } });
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
  await requireAdmin();
  await withScopedPrismaClient((db) => db.accJournalEntry.deleteMany({ where: { id, transactionId: null } }));
  refresh();
}
