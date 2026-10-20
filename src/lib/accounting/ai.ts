import type { PrismaClient } from "@/lib/prisma";
import { askClaude } from "@/lib/proposal-ai";

// AI help for the two chores of bookkeeping: suggesting where a supplier's transactions belong, and reading a PDF
// statement. Suggestions are only proposals — nothing is posted until the user confirms.

export interface AiAccountOption {
  id: string;
  entityId: string;
  entityName: string;
  entityKind: string;
  code: string;
  name: string;
  type: string;
}

function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON in the reply");
  return JSON.parse(text.slice(start, end + 1));
}

/** One suggestion per supplier: which entity and account it most likely belongs to (null = unsure). */
export async function suggestForSuppliers(
  db: PrismaClient,
  suppliers: { name: string; sample: string; amount: number; count: number }[],
  options: AiAccountOption[]
): Promise<Map<string, { accountId: string; entityId: string }>> {
  const out = new Map<string, { accountId: string; entityId: string }>();
  const entities = [...new Map(options.map((o) => [o.entityId, `${o.entityName} (${o.entityKind})`])).entries()];
  const accountList = options
    .filter((o) => o.type === "INCOME" || o.type === "EXPENSE" || o.type === "LIABILITY" || o.type === "ASSET" || o.type === "EQUITY")
    .map((o) => `${o.id}|${o.entityName}|${o.code} ${o.name} [${o.type}]`)
    .join("\n");
  for (let i = 0; i < suppliers.length; i += 30) {
    const batch = suppliers.slice(i, i + 30);
    const prompt = `You are a Canadian bookkeeper (Quebec) doing the books of one person who has a personal set of books, a sole proprietorship (web / funnel / AI consulting and affiliate marketing), and possibly corporations and a US LLC. All their bank statements are from their PERSONAL bank accounts, so personal and business spending are mixed.

For each supplier below pick the most likely account: the entity it belongs to and one account of that entity's chart. Business-looking software, advertising, hosting, domain, professional and office spending goes to the business; groceries, restaurants for family, clothing, health, school and leisure go to Personal; credit-card payments and transfers go to the matching bank / credit-card account; payments to CRA / Revenu Québec for GST/QST go to the sales-tax payable accounts of the business. If you cannot tell, answer null for that supplier.

Entities:
${entities.map(([id, label]) => `${id} = ${label}`).join("\n")}

Accounts (id|entity|code name [type]):
${accountList}

Suppliers (name, one raw bank description, typical amount, how many transactions):
${JSON.stringify(batch)}

Respond with ONLY a JSON object, no markdown fences, no other text, in exactly this shape:
{"suggestions": [{"supplier": "<name as given>", "accountId": "<account id or null>"}]}`;
    const reply = await askClaude(db, prompt, { language: "en" });
    if ("error" in reply) throw new Error(reply.error);
    const parsed = parseJson(reply.text) as { suggestions?: { supplier?: string; accountId?: string | null }[] };
    for (const s of parsed.suggestions ?? []) {
      const opt = options.find((o) => o.id === s.accountId);
      if (s.supplier && opt) out.set(s.supplier, { accountId: opt.id, entityId: opt.entityId });
    }
  }
  return out;
}

export interface PdfRow {
  date: string;
  description: string;
  amount: number;
}

/**
 * Reads the transactions of a PDF bank / credit-card statement with Claude (the PDF is sent as a document, so
 * any bank's layout works). Amounts are signed from the account holder's side: money out / purchases negative,
 * money in / payments positive.
 */
export async function readPdfStatement(db: PrismaClient, pdfBase64: string, kind: "BANK" | "CREDIT_CARD"): Promise<{ rows: PdfRow[]; warning?: string } | { error: string }> {
  const setting = await db.integrationSetting.findUnique({ where: { provider: "anthropic" } });
  if (!setting?.apiKeyEncrypted) return { error: "No Anthropic API key configured — add one in Settings first." };
  const { decryptSecret } = await import("@/lib/crypto");
  const apiKey = await decryptSecret(setting.apiKeyEncrypted);

  const instructions = `This is a ${kind === "CREDIT_CARD" ? "credit-card" : "bank account"} statement. Extract EVERY transaction listed (not the summary, opening / closing balances, interest-rate tables or totals). For each: the transaction date (YYYY-MM-DD; use the statement year when only day and month are shown, and the posting date if there is no transaction date), the description exactly as printed (merchant / payee, without the running balance), and the amount as a number signed from the account holder's side: money OUT / purchases / fees / interest charged are NEGATIVE; money IN / deposits / refunds / payments received are POSITIVE. Use a dot as the decimal separator and no thousands separators.

Respond with ONLY a JSON object, no markdown fences, no other text, in exactly this shape:
{"transactions": [{"date": "2026-03-14", "description": "...", "amount": -12.34}]}`;

  const rows: PdfRow[] = [];
  let warning: string | undefined;
  type Msg = { role: "user" | "assistant"; content: unknown };
  const messages: Msg[] = [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } }, { type: "text", text: instructions }] }];
  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 16000, messages }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return { error: `The AI could not read the PDF (HTTP ${res.status}: ${(await res.text()).slice(0, 160)}).` };
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    // A long statement can be cut off: the JSON may be incomplete, so keep the complete rows and ask for the rest.
    const found = [...text.matchAll(/\{\s*"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"\s*,\s*"description"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"amount"\s*:\s*(-?\d+(?:\.\d+)?)\s*\}/g)];
    for (const m of found) rows.push({ date: m[1], description: JSON.parse(`"${m[2]}"`) as string, amount: Number(m[3]) });
    if (data.stop_reason !== "max_tokens") break;
    if (turn === 5) warning = "The statement is long: the last transactions may be missing — check the row count against the statement.";
    const last = found[found.length - 1];
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `Continue with the transactions AFTER the one dated ${last?.[1] ?? "the last you listed"} described "${last ? JSON.parse(`"${last[2]}"`) : ""}", same JSON shape.` });
  }
  if (rows.length === 0) return { error: "No transactions were found in that PDF." };
  return { rows, warning };
}
