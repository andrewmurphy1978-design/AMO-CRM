import type { PrismaClient } from "@/lib/prisma";
import { parseMessage, extractAttachmentBytes, encodeBase64 } from "@/lib/mail/mime-parse";
import { fetchGmailMessageRaw, getValidAccessToken } from "@/lib/google";
import { listRecentImapMessages, fetchImapMessageRaw } from "@/lib/mail/imap";
import { loadMailbox, getMailboxAccessToken, imapOf } from "@/lib/mail/shared-mailbox";

// Receipts and invoices for transactions (AccDocument). Invoices found in email are read by the AI (vendor, date, total),
// attached to the matching transaction when there is exactly one convincing match, and otherwise kept aside
// (UNMATCHED) and tried again after every import.

/** Documents waiting for a transaction (including ones whose transaction was deleted). */
export const waitingWhere = (ownerId: string) => ({ ownerId, OR: [{ status: "UNMATCHED" }, { status: "ATTACHED", transactionId: null }] });

export const MAX_DOC_BYTES = 8 * 1024 * 1024;
const DAY = 86_400_000;

export interface InvoiceFields {
  isInvoice: boolean;
  vendor: string | null;
  date: string | null; // YYYY-MM-DD
  total: number | null;
  currency: string | null;
  invoiceNumber: string | null;
}

export async function extractInvoiceFields(db: PrismaClient, mimeType: string, base64: string, context: string): Promise<InvoiceFields | { error: string }> {
  const setting = await db.integrationSetting.findUnique({ where: { provider: "anthropic" } });
  if (!setting?.apiKeyEncrypted) return { error: "No Anthropic API key configured." };
  const { decryptSecret } = await import("@/lib/crypto");
  const apiKey = await decryptSecret(setting.apiKeyEncrypted);
  const block =
    mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };
  const instructions = `Decide whether this file is an invoice, bill or receipt that someone PAID or must pay (not a statement, quote, newsletter, contract or marketing material), and read it. ${context}
Respond with ONLY a JSON object, no markdown, in exactly this shape:
{"isInvoice": true, "vendor": "company that issued it", "date": "YYYY-MM-DD invoice or receipt date", "total": 123.45, "currency": "CAD", "invoiceNumber": "..."}
"total" is the final amount including taxes, as a plain number. Use null for anything you cannot read. If it is not an invoice or receipt, answer {"isInvoice": false}.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 600, messages: [{ role: "user", content: [block, { type: "text", text: instructions }] }] }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return { error: `AI HTTP ${res.status}` };
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { error: "Unreadable AI answer" };
    const o = JSON.parse(json) as Partial<InvoiceFields>;
    const total = typeof o.total === "number" && Number.isFinite(o.total) ? Math.abs(o.total) : null;
    const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null;
    return { isInvoice: Boolean(o.isInvoice), vendor: o.vendor ?? null, date, total, currency: o.currency ?? null, invoiceNumber: o.invoiceNumber ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- matching

const tokens = (s: string | null | undefined) =>
  new Set((s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["inc", "ltd", "ltee", "the", "and", "com", "www", "inv", "payment", "paiement"].includes(w)));

export interface Candidate { id: string; date: Date; supplier: string; description: string; amount: number; accountId: string; hasDocs: boolean; vendorHit: boolean }

/** Transactions that could be the payment for this document, best first. */
export async function candidatesFor(
  db: PrismaClient,
  ownerId: string,
  doc: { vendor: string | null; docDate: Date | null; amount: number | null; currency: string | null; subject?: string | null }
): Promise<Candidate[]> {
  if (doc.amount == null || doc.amount <= 0) return [];
  const window = doc.docDate ? { date: { gte: new Date(doc.docDate.getTime() - 7 * DAY), lte: new Date(doc.docDate.getTime() + 75 * DAY) } } : {};
  const txs = await db.accTransaction.findMany({
    where: {
      status: { not: "IGNORED" },
      account: { entity: { ownerId } },
      amount: { gte: -doc.amount - 0.005, lte: -doc.amount + 0.005 },
      ...window,
    },
    include: { account: { select: { currency: true, entity: { select: { currency: true } } } }, documents: { select: { id: true }, take: 1 } },
    take: 50,
  });
  const vendorTokens = tokens(doc.vendor);
  const out: Candidate[] = [];
  for (const t of txs) {
    const cur = t.account.currency ?? t.account.entity.currency;
    if (doc.currency && cur && doc.currency.toUpperCase() !== cur.toUpperCase()) continue;
    const txTokens = tokens(`${t.supplier} ${t.description}`);
    const vendorHit = [...vendorTokens].some((w) => txTokens.has(w));
    out.push({ id: t.id, date: t.date, supplier: t.supplier, description: t.description, amount: t.amount, accountId: t.accountId, hasDocs: t.documents.length > 0, vendorHit });
  }
  const ref = doc.docDate?.getTime();
  out.sort((a, b) => Number(b.vendorHit) - Number(a.vendorHit) || Number(a.hasDocs) - Number(b.hasDocs) || (ref ? Math.abs(a.date.getTime() - ref) - Math.abs(b.date.getTime() - ref) : 0));
  return out;
}

/** Attaches the document when the match is clear: one convincing candidate. Returns the transaction id, or null. */
export async function tryAutoMatch(db: PrismaClient, docId: string): Promise<string | null> {
  const doc = await db.accDocument.findUnique({ where: { id: docId }, select: { id: true, ownerId: true, vendor: true, docDate: true, amount: true, currency: true, status: true, transactionId: true } });
  if (!doc || doc.status === "DISMISSED" || (doc.status === "ATTACHED" && doc.transactionId)) return null;
  const list = await candidatesFor(db, doc.ownerId, doc);
  if (list.length === 0) return null;
  const hits = list.filter((c) => c.vendorHit);
  let pick: Candidate | null = null;
  if (hits.length === 1) pick = hits[0];
  else if (hits.length === 0 && list.length === 1) {
    // No vendor name in common: only trust a lone amount match that falls shortly after the invoice date.
    const only = list[0];
    if (doc.docDate && only.date.getTime() - doc.docDate.getTime() <= 30 * DAY) pick = only;
  } else if (hits.length > 1) {
    const free = hits.filter((c) => !c.hasDocs);
    if (free.length === 1) pick = free[0];
  }
  if (!pick) return null;
  await db.accDocument.update({ where: { id: doc.id }, data: { transactionId: pick.id, status: "ATTACHED", matchedBy: "AUTO" } });
  return pick.id;
}

/** After an import (or on a schedule): tries every waiting document against the books. */
export async function matchWaitingDocuments(db: PrismaClient, ownerId: string): Promise<number> {
  const waiting = await db.accDocument.findMany({ where: { ...waitingWhere(ownerId), amount: { not: null } }, select: { id: true }, take: 200 });
  let n = 0;
  for (const d of waiting) if (await tryAutoMatch(db, d.id)) n++;
  return n;
}

// ---------------------------------------------------------------- email scanning

interface Source { id: string; keys(): Promise<string[]>; raw(key: string): Promise<string | null> }

const GMAIL_QUERY = "has:attachment newer_than:60d -in:sent (filename:pdf OR filename:png OR filename:jpg OR filename:jpeg)";

function gmailSource(id: string, token: string): Source {
  return {
    id,
    async keys() {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=40&q=${encodeURIComponent(GMAIL_QUERY)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return (((await res.json()) as { messages?: { id: string }[] }).messages ?? []).map((m) => m.id);
    },
    async raw(key) {
      return (await fetchGmailMessageRaw(token, key))?.raw ?? null;
    },
  };
}

async function sourcesFor(db: PrismaClient, ownerId: string): Promise<Source[]> {
  const out: Source[] = [];
  const token = await getValidAccessToken(ownerId, db).catch(() => null);
  if (token) out.push(gmailSource(`gmail:${ownerId}`, token));
  const user = await db.user.findUnique({ where: { id: ownerId }, select: { role: true } });
  const boxes =
    user?.role === "ADMIN"
      ? await db.sharedMailbox.findMany({ select: { id: true } })
      : (await db.sharedMailboxAccess.findMany({ where: { userId: ownerId, level: { in: ["READ", "SEND", "COMPLETE"] } }, select: { mailboxId: true } })).map((a) => ({ id: a.mailboxId }));
  for (const b of boxes) {
    const box = await loadMailbox(db, b.id);
    if (!box) continue;
    if (box.kind === "google") {
      const t = await getMailboxAccessToken(db, b.id);
      if (t) out.push(gmailSource(`shared:${b.id}`, t));
    } else {
      const cfg = imapOf(box.creds);
      out.push({
        id: `shared:${b.id}`,
        async keys() {
          return (await listRecentImapMessages(cfg, 40)).filter((m) => m.hasAttachments).map((m) => String(m.uid));
        },
        async raw(key) {
          return fetchImapMessageRaw(cfg, Number(key));
        },
      });
    }
  }
  return out;
}

const LOOKS_LIKE_BILL = /(invoice|receipt|facture|re[cç]u|bill|billing|payment|paiement|commande|order|statement|achat|purchase|abonnement|subscription)/i;

export interface ScanResult { messages: number; documents: number; attached: number; waiting: number; errors: string[] }

/** Reads recent emails for invoices and receipts. Each email is looked at once. Bounded so a scheduled run stays short. */
export async function scanEmailForInvoices(db: PrismaClient, ownerId: string, opts: { maxMessages?: number; maxAi?: number } = {}): Promise<ScanResult> {
  const result: ScanResult = { messages: 0, documents: 0, attached: 0, waiting: 0, errors: [] };
  let aiLeft = opts.maxAi ?? 6;
  let msgLeft = opts.maxMessages ?? 12;
  for (const src of await sourcesFor(db, ownerId)) {
    let keys: string[] = [];
    try {
      keys = await src.keys();
    } catch (e) {
      result.errors.push(`${src.id}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (keys.length === 0) continue;
    const seen = new Set((await db.accScannedEmail.findMany({ where: { ownerId, source: src.id, messageKey: { in: keys } }, select: { messageKey: true } })).map((s) => s.messageKey));
    for (const key of keys.filter((k) => !seen.has(k))) {
      if (msgLeft <= 0 || aiLeft <= 0) return result;
      let retry = false;
      try {
        const raw = await src.raw(key);
        if (!raw) continue;
        const parsed = parseMessage(raw);
        result.messages++;
        msgLeft--;
        const wanted = parsed.attachments
          .map((a, i) => ({ a, i }))
          .filter(({ a }) => /^(application\/pdf|image\/(png|jpe?g|webp))$/i.test(a.mimeType) && a.sizeBytes <= MAX_DOC_BYTES && a.sizeBytes >= (a.mimeType === "application/pdf" ? 3000 : 30000));
        const hint = `${parsed.subject} ${wanted.map((w) => w.a.filename).join(" ")} ${(parsed.text ?? "").slice(0, 600)}`;
        if (wanted.length > 0 && LOOKS_LIKE_BILL.test(hint)) {
          for (const { a, i } of wanted.slice(0, 3)) {
            if (aiLeft <= 0) {
              retry = true;
              break;
            }
            const bytes = extractAttachmentBytes(raw, i);
            if (!bytes) continue;
            aiLeft--;
            const base64 = encodeBase64(bytes.bytes);
            const f = await extractInvoiceFields(db, a.mimeType.toLowerCase().replace("image/jpg", "image/jpeg"), base64, `It arrived by email with the subject "${parsed.subject}" from ${parsed.from.email}.`);
            if ("error" in f) {
              result.errors.push(f.error);
              retry = true;
              continue;
            }
            if (!f.isInvoice) continue;
            const doc = await db.accDocument.create({
              data: {
                ownerId, filename: a.filename || "invoice.pdf", mimeType: a.mimeType.toLowerCase(), sizeBytes: bytes.bytes.length, dataBase64: base64,
                source: "email", emailSource: src.id, emailKey: key, subject: parsed.subject, fromLabel: parsed.from.name ? `${parsed.from.name} <${parsed.from.email}>` : parsed.from.email,
                vendor: f.vendor, docDate: f.date ? new Date(`${f.date}T00:00:00Z`) : null, amount: f.total, currency: f.currency, invoiceNumber: f.invoiceNumber, status: "UNMATCHED",
              },
            });
            result.documents++;
            if (await tryAutoMatch(db, doc.id)) result.attached++;
            else result.waiting++;
          }
        }
      } catch (e) {
        result.errors.push(`${src.id}: ${e instanceof Error ? e.message : String(e)}`);
        retry = true;
      }
      if (!retry) await db.accScannedEmail.upsert({ where: { ownerId_source_messageKey: { ownerId, source: src.id, messageKey: key } }, update: {}, create: { ownerId, source: src.id, messageKey: key } });
    }
  }
  return result;
}
