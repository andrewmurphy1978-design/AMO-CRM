import type { PrismaClient } from "@/lib/prisma";
import { chartFor, entityDefaults, intercoSpec, type EntityKind } from "./charts";
import { buildPosting, r2, type AllocationInput, type PostAccount, type PostEntity, type PostingEntry } from "./posting";
import { parseCsv } from "./csv";
import { supplierKey, supplierName } from "./supplier";

// The database side of the books: creating entities with their chart, bank accounts, the accounts that stand
// for relationships between entities, posting categorized transactions, remembered supplier rules, and import.

export type RuleAllocation = { entityId: string; accountId: string; pct: number; tax?: string | null };

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const chunks = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

// ---------------------------------------------------------------- entities & accounts

export async function ensureEntityChart(db: PrismaClient, entityId: string): Promise<void> {
  const entity = await db.accEntity.findUniqueOrThrow({ where: { id: entityId } });
  const have = await db.accAccount.count({ where: { entityId } });
  if (have > 0) return;
  const chart = chartFor(entity.kind as EntityKind, entity.country);
  await db.accAccount.createMany({
    data: chart.map((c, order) => ({
      entityId,
      code: c.code,
      name: c.en,
      nameFr: c.fr,
      type: c.type,
      subtype: c.subtype,
      taxLine: c.taxLine ?? null,
      deductiblePct: c.deductiblePct ?? 100,
      isSystem: Boolean(c.system),
      order,
    })),
    skipDuplicates: true,
  });
}

export async function createEntity(
  db: PrismaClient,
  input: { name: string; kind: EntityKind; country?: string; province?: string | null; currency?: string; fiscalYearEndMonth?: number; basis?: string; salesTaxRegistered?: boolean; legalName?: string; taxNumber?: string }
) {
  const d = entityDefaults(input.kind);
  const order = await db.accEntity.count();
  const entity = await db.accEntity.create({
    data: {
      name: input.name,
      kind: input.kind,
      country: input.country ?? d.country,
      province: input.province ?? (input.kind === "LLC" ? null : "QC"),
      currency: input.currency ?? d.currency,
      fiscalYearEndMonth: input.fiscalYearEndMonth ?? 12,
      basis: input.basis ?? d.basis,
      salesTaxRegistered: input.salesTaxRegistered ?? false,
      legalName: input.legalName ?? null,
      taxNumber: input.taxNumber ?? null,
      order,
    },
  });
  await ensureEntityChart(db, entity.id);
  return entity;
}

/** First visit: the owner's personal books and the sole proprietorship (Andrew Murphy Online). */
export async function ensureAccountingSetup(db: PrismaClient): Promise<void> {
  if ((await db.accEntity.count()) > 0) return;
  await createEntity(db, { name: "Personal", kind: "PERSONAL" });
  await createEntity(db, { name: "Andrew Murphy Online", kind: "SOLE_PROPRIETORSHIP", legalName: "Andrew Murphy Online (sole proprietorship)" });
}

async function nextCode(db: PrismaClient, entityId: string, from: number, to: number): Promise<string> {
  const rows = await db.accAccount.findMany({ where: { entityId, code: { gte: String(from), lte: String(to) } }, select: { code: true } });
  const used = new Set(rows.map((r) => Number(r.code)));
  for (let c = from; c <= to; c++) if (!used.has(c)) return String(c);
  throw new Error("No free account code left in that range.");
}

export async function createBankAccount(
  db: PrismaClient,
  input: { entityId: string; name: string; kind: "CHEQUING" | "SAVINGS" | "CREDIT_CARD"; institution?: string; last4?: string; importSign?: number }
) {
  const card = input.kind === "CREDIT_CARD";
  const code = card ? await nextCode(db, input.entityId, 2010, 2099) : await nextCode(db, input.entityId, 1010, 1099);
  return db.accAccount.create({
    data: {
      entityId: input.entityId,
      code,
      name: input.name,
      type: card ? "LIABILITY" : "ASSET",
      subtype: card ? "CREDIT_CARD" : "BANK",
      institution: input.institution ?? null,
      last4: input.last4 ?? null,
      importSign: input.importSign ?? 1,
      isSystem: true,
    },
  });
}

/** The account in `entityId`'s books for the relationship with `otherId` (created the first time it is needed). */
export async function ensureInterco(db: PrismaClient, entityId: string, otherId: string): Promise<string> {
  const [entity, other] = await Promise.all([db.accEntity.findUniqueOrThrow({ where: { id: entityId } }), db.accEntity.findUniqueOrThrow({ where: { id: otherId } })]);
  const spec = intercoSpec({ kind: entity.kind as EntityKind }, { kind: other.kind as EntityKind, name: other.name });
  if (spec.unique) {
    const found = await db.accAccount.findUnique({ where: { entityId_code: { entityId, code: spec.code } } });
    if (found) return found.id;
    const created = await db.accAccount.create({ data: { entityId, code: spec.code, name: spec.en, nameFr: spec.fr, type: spec.type, subtype: spec.subtype, isSystem: true, counterEntityId: otherId } });
    return created.id;
  }
  const found = await db.accAccount.findFirst({ where: { entityId, counterEntityId: otherId, subtype: { in: ["INTERCO", "OWNER_INVESTMENT"] } } });
  if (found) return found.id;
  const code = await nextCode(db, entityId, spec.type === "ASSET" ? 1900 : 2900, spec.type === "ASSET" ? 1999 : 2999);
  const created = await db.accAccount.create({ data: { entityId, code, name: spec.en, nameFr: spec.fr, type: spec.type, subtype: spec.subtype, isSystem: true, counterEntityId: otherId } });
  return created.id;
}

// ---------------------------------------------------------------- posting

export type PostItem = { txId: string; allocations: AllocationInput[]; by?: "USER" | "RULE" | "AI" };
export type PostResult = { posted: number; errors: { txId: string; message: string }[] };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function postTransactions(db: PrismaClient, items: PostItem[]): Promise<PostResult> {
  const result: PostResult = { posted: 0, errors: [] };
  if (items.length === 0) return result;

  const txs = await db.accTransaction.findMany({ where: { id: { in: items.map((i) => i.txId) } }, include: { account: true } });
  const txById = new Map(txs.map((t) => [t.id, t]));

  const entityIds = new Set<string>();
  for (const t of txs) entityIds.add(t.account.entityId);
  for (const i of items) for (const a of i.allocations) entityIds.add(a.entityId);
  const entities = await db.accEntity.findMany({ where: { id: { in: [...entityIds] } } });
  const accounts = await db.accAccount.findMany({ where: { entityId: { in: [...entityIds] } } });
  const entMap = new Map<string, PostEntity>(entities.map((e) => [e.id, { id: e.id, name: e.name, kind: e.kind as EntityKind, country: e.country, province: e.province, salesTaxRegistered: e.salesTaxRegistered }]));
  const accMap = new Map<string, PostAccount>(accounts.map((a) => [a.id, { id: a.id, entityId: a.entityId, code: a.code, type: a.type, subtype: a.subtype }]));

  // Relationship accounts needed (a pair at a time, created on demand).
  const intercoCache = new Map<string, string>();
  const needInterco = async (a: string, b: string) => {
    const key = `${a}>${b}`;
    if (!intercoCache.has(key)) {
      const id = await ensureInterco(db, a, b);
      intercoCache.set(key, id);
      if (!accMap.has(id)) {
        const acc = await db.accAccount.findUniqueOrThrow({ where: { id } });
        accMap.set(id, { id: acc.id, entityId: acc.entityId, code: acc.code, type: acc.type, subtype: acc.subtype });
      }
    }
  };
  for (const i of items) {
    const tx = txById.get(i.txId);
    if (!tx) continue;
    for (const a of i.allocations) if (a.entityId !== tx.account.entityId) {
      await needInterco(tx.account.entityId, a.entityId);
      await needInterco(a.entityId, tx.account.entityId);
    }
  }
  const byCode = new Map<string, string>();
  for (const a of accounts) byCode.set(`${a.entityId}:${a.code}`, a.id);

  const entryRows: { id: string; entityId: string; date: Date; memo: string; source: string; transactionId: string }[] = [];
  const lineRows: { entryId: string; accountId: string; debit: number; credit: number; memo: string | null }[] = [];
  const postedIds: { id: string; by: string; allocations: AllocationInput[] }[] = [];
  const transfers: { tx: (typeof txs)[number]; counterBankId: string }[] = [];

  for (const item of items) {
    const tx = txById.get(item.txId);
    if (!tx) continue;
    try {
      const built: PostingEntry[] = buildPosting({
        tx: { id: tx.id, date: isoDate(tx.date), amount: tx.amount, description: tx.supplier || tx.description },
        bank: { id: tx.accountId, entityId: tx.account.entityId },
        allocations: item.allocations,
        ctx: { entities: entMap, accounts: accMap, accountByCode: (e, c) => byCode.get(`${e}:${c}`), interco: (a, b) => intercoCache.get(`${a}>${b}`) as string },
      });
      for (const e of built) {
        const id = crypto.randomUUID();
        entryRows.push({ id, entityId: e.entityId, date: tx.date, memo: e.memo, source: e.source === "BANK" ? "BANK" : "INTERCO", transactionId: tx.id });
        for (const l of e.lines) lineRows.push({ entryId: id, accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo ?? null });
      }
      postedIds.push({ id: tx.id, by: item.by ?? "USER", allocations: item.allocations });
      for (const a of item.allocations) {
        const acc = accMap.get(a.accountId);
        if (acc && (acc.subtype === "BANK" || acc.subtype === "CREDIT_CARD")) transfers.push({ tx, counterBankId: acc.id });
      }
    } catch (e) {
      result.errors.push({ txId: item.txId, message: e instanceof Error ? e.message : "Could not post." });
    }
  }

  const ids = postedIds.map((p) => p.id);
  if (ids.length > 0) {
    await db.accJournalEntry.deleteMany({ where: { transactionId: { in: ids } } });
    for (const c of chunks(entryRows, 500)) await db.accJournalEntry.createMany({ data: c });
    for (const c of chunks(lineRows, 1000)) await db.accJournalLine.createMany({ data: c });
    // What each transaction was posted as (shown in the list, prefilled when editing), in small batches.
    for (const group of chunks(postedIds, 100)) {
      await db.$transaction(
        group.map((p) => db.accTransaction.update({ where: { id: p.id }, data: { status: "POSTED", categorizedBy: p.by, allocations: p.allocations as never } }))
      );
    }
    result.posted = ids.length;
  }

  // A transfer between two of the owner's accounts appears on both statements: the other half is the same
  // posting, so it is linked rather than posted again.
  for (const t of transfers) {
    const from = new Date(t.tx.date.getTime() - 5 * 86400000);
    const to = new Date(t.tx.date.getTime() + 5 * 86400000);
    const candidates = await db.accTransaction.findMany({
      where: { accountId: t.counterBankId, status: { in: ["NEW", "SUGGESTED"] }, amount: r2(-t.tx.amount), date: { gte: from, lte: to }, matchedTransactionId: null },
      orderBy: { date: "asc" },
    });
    const best = candidates.sort((x, y) => Math.abs(x.date.getTime() - t.tx.date.getTime()) - Math.abs(y.date.getTime() - t.tx.date.getTime()))[0];
    if (best) await db.accTransaction.update({ where: { id: best.id }, data: { status: "POSTED", categorizedBy: "USER", matchedTransactionId: t.tx.id } });
  }
  return result;
}

export async function unpostTransactions(db: PrismaClient, txIds: string[]): Promise<void> {
  if (txIds.length === 0) return;
  await db.accJournalEntry.deleteMany({ where: { transactionId: { in: txIds } } });
  const linked = await db.accTransaction.findMany({ where: { matchedTransactionId: { in: txIds } }, select: { id: true } });
  await db.accTransaction.updateMany({ where: { id: { in: [...txIds, ...linked.map((l) => l.id)] } }, data: { status: "NEW", categorizedBy: null, matchedTransactionId: null } });
}

// ---------------------------------------------------------------- remembered suppliers

/** Remembers how a supplier is categorized: the next transactions from it are posted the same way. */
export async function saveRule(db: PrismaClient, supplier: string, allocations: RuleAllocation[]): Promise<void> {
  const pattern = supplierKey(supplier);
  if (!pattern) return;
  await db.accRule.upsert({ where: { pattern }, update: { allocations: allocations as never }, create: { pattern, allocations: allocations as never } });
}

/** Turns a rule's percentages into amounts for one transaction (the last line takes the rounding cents). */
export function allocationsFromRule(rule: RuleAllocation[], amount: number): AllocationInput[] {
  const total = r2(Math.abs(amount));
  let left = total;
  return rule.map((r, i) => {
    const part = i === rule.length - 1 ? left : r2((total * r.pct) / 100);
    left = r2(left - part);
    return { entityId: r.entityId, accountId: r.accountId, amount: part, tax: r.tax ?? null };
  });
}

/** Posts every not-yet-categorized transaction whose supplier has a remembered rule. */
export async function applyRules(db: PrismaClient, txIds?: string[]): Promise<{ posted: number; errors: PostResult["errors"] }> {
  const rules = await db.accRule.findMany();
  if (rules.length === 0) return { posted: 0, errors: [] };
  const byPattern = new Map(rules.map((r) => [r.pattern, r]));
  const open = await db.accTransaction.findMany({ where: { status: { in: ["NEW", "SUGGESTED"] }, ...(txIds ? { id: { in: txIds } } : {}) }, select: { id: true, supplier: true, description: true, amount: true } });
  const items: PostItem[] = [];
  const used = new Set<string>();
  for (const t of open) {
    const key = supplierKey(t.supplier || supplierName(t.description));
    const rule = byPattern.get(key);
    if (!rule) continue;
    used.add(rule.id);
    items.push({ txId: t.id, by: "RULE", allocations: allocationsFromRule(rule.allocations as unknown as RuleAllocation[], t.amount) });
  }
  const res = await postTransactions(db, items);
  for (const id of used) await db.accRule.update({ where: { id }, data: { hits: { increment: 1 } } });
  return { posted: res.posted, errors: res.errors };
}

// ---------------------------------------------------------------- import

export type ImportRow = { date: string; description: string; amount: number };

export async function importTransactions(db: PrismaClient, accountId: string, rows: ImportRow[], fileName: string): Promise<{ rows: number; added: number; duplicates: number; autoPosted: number; transfersLinked: number }> {
  const account = await db.accAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.subtype !== "BANK" && account.subtype !== "CREDIT_CARD") throw new Error("Choose a bank or credit-card account to import into.");
  const sign = account.importSign === -1 ? -1 : 1;

  // The same date + amount + description can legitimately happen twice in a day: count occurrences so a
  // re-imported overlapping file still matches exactly.
  const seen = new Map<string, number>();
  const prepared: { date: Date; description: string; amount: number; dedupeKey: string; supplier: string }[] = [];
  for (const r of rows) {
    const amount = r2(r.amount * sign);
    const base = `${r.date}|${amount.toFixed(2)}|${supplierKey(r.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    prepared.push({ date: new Date(`${r.date}T00:00:00.000Z`), description: r.description, amount, dedupeKey: await sha256(`${base}|${n}`), supplier: supplierName(r.description) });
  }
  const existing = new Set<string>();
  for (const c of chunks(prepared.map((p) => p.dedupeKey), 1000)) {
    const found = await db.accTransaction.findMany({ where: { accountId, dedupeKey: { in: c } }, select: { dedupeKey: true } });
    for (const f of found) existing.add(f.dedupeKey);
  }
  const fresh = prepared.filter((p) => !existing.has(p.dedupeKey));
  const batch = await db.accImportBatch.create({ data: { accountId, fileName, rowCount: rows.length, newCount: fresh.length, dupCount: rows.length - fresh.length } });
  const created: string[] = [];
  for (const c of chunks(fresh, 500)) {
    const withIds = c.map((p) => ({ id: crypto.randomUUID(), accountId, batchId: batch.id, ...p }));
    await db.accTransaction.createMany({ data: withIds });
    created.push(...withIds.map((w) => w.id));
  }

  // Halves of transfers already posted from the other account (e.g. the card payment seen from the card).
  let transfersLinked = 0;
  if (fresh.length > 0) {
    const min = new Date(Math.min(...fresh.map((f) => f.date.getTime())) - 5 * 86400000);
    const max = new Date(Math.max(...fresh.map((f) => f.date.getTime())) + 5 * 86400000);
    const posted = await db.accTransaction.findMany({
      where: { status: "POSTED", matchedTransactionId: null, accountId: { not: accountId }, date: { gte: min, lte: max }, entries: { some: { lines: { some: { accountId } } } } },
      select: { id: true, date: true, amount: true },
    });
    const taken = new Set<string>();
    const newRows = await db.accTransaction.findMany({ where: { id: { in: created } }, select: { id: true, date: true, amount: true } });
    for (const p of posted) {
      const hit = newRows.filter((n) => !taken.has(n.id) && r2(n.amount) === r2(-p.amount) && Math.abs(n.date.getTime() - p.date.getTime()) <= 5 * 86400000).sort((x, y) => Math.abs(x.date.getTime() - p.date.getTime()) - Math.abs(y.date.getTime() - p.date.getTime()))[0];
      if (hit) {
        taken.add(hit.id);
        await db.accTransaction.update({ where: { id: hit.id }, data: { status: "POSTED", categorizedBy: "USER", matchedTransactionId: p.id } });
        transfersLinked++;
      }
    }
  }

  const auto = await applyRules(db, created);
  return { rows: rows.length, added: fresh.length, duplicates: rows.length - fresh.length, autoPosted: auto.posted, transfersLinked };
}

export { parseCsv };
