import type { PrismaClient } from "@/lib/prisma";
import { lockedThrough } from "./reconcile";
import { LEGACY_NAME_FIXES, groupsFor, REGISTERED_TYPES, chartFor, suggestGifi, usesGifi, entityDefaults, intercoSpec, type EntityKind } from "./charts";
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
  const chart = chartFor(entity.kind as EntityKind, entity.country);
  // Also adds accounts that were added to the template after the entity was created.
  const existing = await db.accAccount.findMany({ where: { entityId }, select: { id: true, code: true, gifi: true, name: true, type: true, subtype: true } });
  const haveCodes = new Set(existing.map((a) => a.code));
  // Canadian businesses: input tax credits used to be assets (1300 / 1310); they now sit under the tax payable
  // accounts (2301 / 2311) and 1300 / 1310 become the GST/HST and QST receivable accounts.
  if ((entity.kind === "SOLE_PROPRIETORSHIP" || entity.kind === "CORPORATION") && entity.country === "CA") {
    for (const [oldCode, newCode, payableCode] of [["1300", "2301", "2300"], ["1310", "2311", "2310"]]) {
      const old = existing.find((a) => a.code === oldCode && a.type === "ASSET" && a.subtype === "TAX_RECOVERABLE");
      if (!old || haveCodes.has(newCode)) continue;
      const payable = existing.find((a) => a.code === payableCode);
      await db.accAccount.update({ where: { id: old.id }, data: { code: newCode, type: "LIABILITY", subtype: "TAX_RECOVERABLE", section: null, parentId: payable?.id ?? null } });
      haveCodes.delete(oldCode);
      haveCodes.add(newCode);
    }
  }
  // Canadian corporations: fill in the suggested GIFI code on accounts that have none yet.
  if (usesGifi(entity.kind, entity.country)) {
    for (const a of existing) {
      const g = a.gifi ? null : suggestGifi(entity.kind, a);
      if (g) await db.accAccount.update({ where: { id: a.id }, data: { gifi: g } });
    }
  }
  if (entity.kind === "PERSONAL") {
    for (const a of existing) {
      const fix = LEGACY_NAME_FIXES[a.code];
      if (fix && a.name === fix.oldName) await db.accAccount.update({ where: { id: a.id }, data: { name: fix.en, nameFr: fix.fr } });
    }
  }
  const missing = chart.map((c, order) => ({ c, order })).filter(({ c }) => !haveCodes.has(c.code));
  // Income / expense sub-categories: a group is created once (with at least one of its accounts in the chart) and
  // adopts those of its accounts that have no parent yet. Groups that already exist are left as the user has them.
  const groups = groupsFor(entity.kind as EntityKind, entity.country).filter((g) => !haveCodes.has(g.code) && g.members.some((m) => haveCodes.has(m) || chart.some((c) => c.code === m)));
  for (const g of groups) {
    await db.accAccount.create({ data: { entityId, code: g.code, name: g.en, nameFr: g.fr, type: g.type, subtype: "GROUP", isSystem: true, order: 9000 } }).catch(() => null);
  }
  if (missing.length === 0 && groups.length === 0) return;
  if (missing.length > 0) await db.accAccount.createMany({
    data: missing.map(({ c, order }) => ({
      entityId,
      code: c.code,
      name: c.en,
      nameFr: c.fr,
      type: c.type,
      subtype: c.subtype,
      taxLine: c.taxLine ?? null,
      gifi: usesGifi(entity.kind, entity.country) ? suggestGifi(entity.kind, { code: c.code, name: c.en, type: c.type, subtype: c.subtype }) : null,
      deductiblePct: c.deductiblePct ?? 100,
      isSystem: Boolean(c.system),
      order,
    })),
    skipDuplicates: true,
  });
  // Second-level accounts (the input tax credits sit under the tax payable accounts).
  const withParent = missing.filter(({ c }) => c.parent);
  if (withParent.length > 0) {
    const rows = await db.accAccount.findMany({ where: { entityId }, select: { id: true, code: true } });
    const idOf = new Map(rows.map((r) => [r.code, r.id]));
    for (const { c } of withParent) {
      const child = idOf.get(c.code);
      const parent = idOf.get(c.parent as string);
      if (child && parent) await db.accAccount.update({ where: { id: child }, data: { parentId: parent } });
    }
  }
  // Adopt members into the groups just created.
  if (groups.length > 0) {
    const rows = await db.accAccount.findMany({ where: { entityId }, select: { id: true, code: true, parentId: true } });
    const idOf = new Map(rows.map((r) => [r.code, r]));
    for (const g of groups) {
      const gid = idOf.get(g.code)?.id;
      if (!gid) continue;
      for (const m of g.members) {
        const acc = idOf.get(m);
        if (acc && !acc.parentId) await db.accAccount.update({ where: { id: acc.id }, data: { parentId: gid } });
      }
    }
  }
}

export async function createEntity(
  db: PrismaClient,
  input: { name: string; kind: EntityKind; country?: string; province?: string | null; currency?: string; fiscalYearEndMonth?: number; basis?: string; salesTaxRegistered?: boolean; legalName?: string; taxNumber?: string; taxNumbers?: unknown; ownerId?: string | null }
) {
  const d = entityDefaults(input.kind);
  const order = await db.accEntity.count({ where: { ownerId: input.ownerId ?? null } });
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
      taxNumbers: (input.taxNumbers as never) ?? undefined,
      ownerId: input.ownerId ?? null,
      order,
    },
  });
  await ensureEntityChart(db, entity.id);
  return entity;
}

/**
 * First visit of a user: their own books. Everyone gets a Personal entity; the admin also gets the sole
 * proprietorship (Andrew Murphy Online). Books created before ownership existed are claimed by the first admin visit.
 */
export async function ensureAccountingSetup(db: PrismaClient, user: { id: string; admin: boolean }): Promise<void> {
  if (user.admin) {
    await db.accEntity.updateMany({ where: { ownerId: null }, data: { ownerId: user.id } });
    await db.accRule.updateMany({ where: { ownerId: null }, data: { ownerId: user.id } });
  }
  const entities = await db.accEntity.findMany({ where: { ownerId: user.id }, select: { id: true } });
  if (entities.length > 0) {
    for (const e of entities) await ensureEntityChart(db, e.id);
    return;
  }
  await createEntity(db, { name: "Personal", kind: "PERSONAL", ownerId: user.id });
  if (user.admin) await createEntity(db, { name: "Andrew Murphy Online", kind: "SOLE_PROPRIETORSHIP", legalName: "Andrew Murphy Online (sole proprietorship)", ownerId: user.id });
}

async function nextCode(db: PrismaClient, entityId: string, from: number, to: number): Promise<string> {
  const rows = await db.accAccount.findMany({ where: { entityId, code: { gte: String(from), lte: String(to) } }, select: { code: true } });
  const used = new Set(rows.map((r) => Number(r.code)));
  for (let c = from; c <= to; c++) if (!used.has(c)) return String(c);
  throw new Error("No free account code left in that range.");
}

export async function createBankAccount(
  db: PrismaClient,
  input: { entityId: string; name: string; kind: string; institution?: string; last4?: string; importSign?: number; currency?: string; nameFr?: string }
) {
  const card = input.kind === "CREDIT_CARD";
  // TFSA, RRSP, FHSA, RESP, LIRA, RRIF, LIF and non-registered investment accounts: statement accounts like a bank
  // account, shown under long-term assets.
  const registeredType = input.kind in REGISTERED_TYPES ? input.kind : null;
  const code = card ? await nextCode(db, input.entityId, 2010, 2099) : await nextCode(db, input.entityId, 1010, 1099);
  return db.accAccount.create({
    data: {
      entityId: input.entityId,
      code,
      name: input.name,
      nameFr: input.nameFr ?? null,
      type: card ? "LIABILITY" : "ASSET",
      subtype: card ? "CREDIT_CARD" : "BANK",
      institution: input.institution ?? null,
      last4: input.last4 ?? null,
      importSign: input.importSign ?? 1,
      registeredType,
      section: registeredType ? "LONG_TERM" : null,
      currency: input.currency || null,
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
        tx: { id: tx.id, date: isoDate(tx.date), amount: r2(tx.amount * (tx.fxRate || 1)), description: tx.supplier || tx.description },
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
export async function saveRule(db: PrismaClient, ownerId: string, supplier: string, allocations: RuleAllocation[]): Promise<void> {
  const pattern = supplierKey(supplier);
  if (!pattern) return;
  await db.accRule.upsert({ where: { ownerId_pattern: { ownerId, pattern } }, update: { allocations: allocations as never }, create: { ownerId, pattern, allocations: allocations as never } });
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
export async function applyRules(db: PrismaClient, ownerId: string | null, txIds?: string[]): Promise<{ posted: number; errors: PostResult["errors"] }> {
  const rules = await db.accRule.findMany({ where: { ownerId } });
  if (rules.length === 0) return { posted: 0, errors: [] };
  const byPattern = new Map(rules.map((r) => [r.pattern, r]));
  const open = await db.accTransaction.findMany({ where: { status: { in: ["NEW", "SUGGESTED"] }, account: { entity: { ownerId } }, ...(txIds ? { id: { in: txIds } } : {}) }, select: { id: true, accountId: true, supplier: true, description: true, amount: true } });
  const items: PostItem[] = [];
  const used = new Set<string>();
  for (const t of open) {
    const key = supplierKey(t.supplier || supplierName(t.description));
    const rule = byPattern.get(key);
    if (!rule) continue;
    // A transaction can never be categorized to its own bank account (a transfer goes to the other account).
    if ((rule.allocations as unknown as RuleAllocation[]).some((a) => a.accountId === t.accountId)) continue;
    used.add(rule.id);
    items.push({ txId: t.id, by: "RULE", allocations: allocationsFromRule(rule.allocations as unknown as RuleAllocation[], t.amount) });
  }
  const res = await postTransactions(db, items);
  for (const id of used) await db.accRule.update({ where: { id }, data: { hits: { increment: 1 } } });
  return { posted: res.posted, errors: res.errors };
}

// ---------------------------------------------------------------- import

export type ImportRow = { date: string; description: string; amount: number; supplier?: string };

export async function importTransactions(db: PrismaClient, accountId: string, rows: ImportRow[], fileName: string, fxRate = 1): Promise<{ rows: number; added: number; duplicates: number; dateMismatches: number; autoPosted: number; transfersLinked: number }> {
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
    prepared.push({ date: new Date(`${r.date}T00:00:00.000Z`), description: r.description, amount, dedupeKey: await sha256(`${base}|${n}`), supplier: supplierName(r.supplier || r.description) });
  }
  const existing = new Set<string>();
  const matchedIds = new Set<string>();
  for (const c of chunks(prepared.map((p) => p.dedupeKey), 1000)) {
    const found = await db.accTransaction.findMany({ where: { accountId, dedupeKey: { in: c } }, select: { id: true, dedupeKey: true } });
    for (const f of found) {
      existing.add(f.dedupeKey);
      matchedIds.add(f.id);
    }
  }
  // A second pass for rows whose date was read the other way round (03/04 as 4 March instead of 3 April): the same
  // amount and description with the day and month swapped is the same transaction, not a new one.
  const sameWithSwappedDate = new Set<string>();
  const stillNew = prepared.filter((p) => !existing.has(p.dedupeKey));
  if (stillNew.length > 0) {
    const amounts = [...new Set(stillNew.map((p) => p.amount))];
    const candidates: { id: string; date: Date; amount: number; description: string }[] = [];
    for (const c of chunks(amounts, 500)) {
      candidates.push(...(await db.accTransaction.findMany({ where: { accountId, amount: { in: c }, id: { notIn: [...matchedIds] } }, select: { id: true, date: true, amount: true, description: true } })));
    }
    const used = new Set<string>();
    for (const p of stillNew) {
      const m = p.date.getUTCMonth() + 1;
      const d = p.date.getUTCDate();
      if (m === d || d > 12) continue;
      const swapped = Date.UTC(p.date.getUTCFullYear(), d - 1, m);
      const key = supplierKey(p.description);
      const hit = candidates.find((c) => !used.has(c.id) && r2(c.amount) === p.amount && c.date.getTime() === swapped && supplierKey(c.description) === key);
      if (hit) {
        used.add(hit.id);
        sameWithSwappedDate.add(p.dedupeKey);
      }
    }
  }
  const fresh = prepared.filter((p) => !existing.has(p.dedupeKey) && !sameWithSwappedDate.has(p.dedupeKey));
  // A reconciled month is closed: new transactions cannot appear in it.
  const lock = await lockedThrough(db, accountId);
  if (lock) {
    const inLocked = fresh.filter((f) => f.date <= lock).length;
    if (inLocked > 0) throw new Error(`${inLocked} transaction(s) in the file are dated in a month that is already reconciled and locked (up to ${lock.toISOString().slice(0, 10)}). Unlock that month in Reconcile, or check the date order.`);
  }
  const batch = await db.accImportBatch.create({ data: { accountId, fileName, rowCount: rows.length, newCount: fresh.length, dupCount: rows.length - fresh.length } });
  const created: string[] = [];
  for (const c of chunks(fresh, 500)) {
    const withIds = c.map((p) => ({ id: crypto.randomUUID(), accountId, batchId: batch.id, fxRate: fxRate > 0 ? fxRate : 1, ...p }));
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

  const owner = await db.accEntity.findUnique({ where: { id: account.entityId }, select: { ownerId: true } });
  const auto = await applyRules(db, owner?.ownerId ?? null, created);
  return { rows: rows.length, added: fresh.length, duplicates: rows.length - fresh.length, dateMismatches: sameWithSwappedDate.size, autoPosted: auto.posted, transfersLinked };
}

export { parseCsv };
