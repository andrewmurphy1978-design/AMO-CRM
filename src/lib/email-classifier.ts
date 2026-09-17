import type { PrismaClient } from "@/lib/prisma";
import type { EmailSummary } from "@/lib/google";
import { decryptSecret } from "@/lib/crypto";

export type EmailCategory = "NEEDS_REPLY" | "NEEDS_ATTENTION" | "CAN_WAIT" | "LOW_PRIORITY";

const VALID_CATEGORIES: EmailCategory[] = ["NEEDS_REPLY", "NEEDS_ATTENTION", "CAN_WAIT", "LOW_PRIORITY"];

// Fast, cheap model — this is a bulk triage call over a snippet-length
// amount of text per message, not a task that needs Sonnet-level judgment.
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

function buildPrompt(emails: { id: string; from: string; subject: string; snippet: string }[], customInstructions?: string | null): string {
  const list = emails
    .map((e, i) => `${i + 1}. id: ${e.id}\n   From: ${e.from}\n   Subject: ${e.subject}\n   Snippet: ${e.snippet}`)
    .join("\n\n");
  // User-supplied rules from Settings, layered on top of the built-in
  // categories rather than replacing them — e.g. "always treat emails
  // from my accountant as Needs a reply".
  const extra = customInstructions?.trim()
    ? `\nThe user has also given these additional rules — apply them on top of the categories above, and let them override the defaults when they conflict:\n${customInstructions.trim()}\n`
    : "";
  return `You are triaging an inbox for a busy small-business owner and parent. For each email below, classify it into exactly one of these four categories:

- NEEDS_REPLY: the sender is waiting on a response, answer, or action from the recipient (a question, a request, a client asking something).
- NEEDS_ATTENTION: important and needs the recipient's attention or action soon, but doesn't require writing a reply (an urgent alert, a bill due, a booking confirmation, a deadline reminder).
- CAN_WAIT: worth reading eventually but not urgent (school/parent-association newsletters, community updates, general FYI messages).
- LOW_PRIORITY: no real importance (marketing newsletters, promotional offers, automated receipts/invoices, notifications needing no action).
${extra}
Respond with ONLY a JSON object mapping each email's "id" to its category — no other text, no markdown fences. Example: {"abc123":"NEEDS_REPLY","def456":"LOW_PRIORITY"}

Emails:
${list}`;
}

// The key can come from the Settings page (stored encrypted, rotated
// without touching a terminal) or, as a fallback, the Cloudflare secret
// set via `wrangler secret put` — whichever is configured keeps working.
async function getStoredApiKey(db: PrismaClient): Promise<string | null> {
  const setting = await db.integrationSetting.findUnique({ where: { provider: "anthropic" } });
  if (!setting?.apiKeyEncrypted) return null;
  return decryptSecret(setting.apiKeyEncrypted);
}

async function callClaude(
  emails: { id: string; from: string; subject: string; snippet: string }[],
  apiKey: string | null,
  customInstructions?: string | null
): Promise<Record<string, EmailCategory>> {
  if (!apiKey || emails.length === 0) return {};

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        // Each line is an id (several tokens) plus a category name (up to
        // 4 tokens for NEEDS_ATTENTION) plus formatting/fence overhead —
        // 20 tokens/email was too tight and truncated large inboxes
        // mid-response, losing the whole batch. 60/email plus a big floor
        // leaves headroom; parsing below is also truncation-tolerant.
        max_tokens: Math.max(1024, emails.length * 60),
        messages: [{ role: "user", content: buildPrompt(emails, customInstructions) }],
      }),
    });
    if (!res.ok) {
      // Logged rather than swallowed so `wrangler tail` can show the real
      // reason (bad key, wrong model id, rate limit, etc.) instead of every
      // email just silently landing in CAN_WAIT with no trace of why.
      console.error("email-classifier: Anthropic API returned", res.status, await res.text());
      return {};
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const rawText = data.content?.find((c) => c.type === "text")?.text ?? "";
    // Scan for "id":"CATEGORY" pairs directly rather than requiring the
    // whole response to be valid JSON — a markdown fence, or a response
    // that got cut off mid-object because max_tokens ran out on a large
    // batch, still leaves every *complete* line readable this way, so a
    // truncated response loses only the trailing few emails instead of
    // the entire batch.
    const result: Record<string, EmailCategory> = {};
    const pairPattern = /"([^"]+)"\s*:\s*"([A-Z_]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = pairPattern.exec(rawText)) !== null) {
      const [, id, category] = match;
      if (VALID_CATEGORIES.includes(category as EmailCategory)) {
        result[id] = category as EmailCategory;
      }
    }
    if (Object.keys(result).length === 0) {
      console.error("email-classifier: couldn't find any id/category pairs in response:", rawText);
    }
    return result;
  } catch (err) {
    console.error("email-classifier: request failed:", err);
    return {};
  }
}

// Classifies whichever of these emails haven't been classified before —
// an email's importance doesn't change once it exists, so results are
// cached forever, keyed by Gmail's own message id. Revisiting the Email
// page only ever classifies genuinely new messages, not the whole inbox
// each time. Falls back to CAN_WAIT (a neutral, still-visible bucket) for
// anything the model call couldn't classify (no API key configured, the
// call failed, or its response didn't parse) — so the page always works,
// just without differentiation, rather than breaking.
export async function getEmailClassifications(
  db: PrismaClient,
  emails: EmailSummary[],
  userId?: string
): Promise<Record<string, EmailCategory>> {
  if (emails.length === 0) return {};

  const ids = emails.map((e) => e.id);
  const cached = await db.emailClassification.findMany({ where: { gmailMessageId: { in: ids } } });
  const result: Record<string, EmailCategory> = {};
  for (const c of cached) result[c.gmailMessageId] = c.category as EmailCategory;

  const uncached = emails.filter((e) => !(e.id in result));
  if (uncached.length === 0) return result;

  const apiKey = (await getStoredApiKey(db)) ?? process.env.ANTHROPIC_API_KEY ?? null;
  const customInstructions = userId
    ? (await db.user.findUnique({ where: { id: userId }, select: { emailScreeningInstructions: true } }))?.emailScreeningInstructions
    : null;
  const classified = await callClaude(
    uncached.map((e) => ({ id: e.id, from: e.from, subject: e.subject, snippet: e.snippet })),
    apiKey,
    customInstructions
  );

  const toCreate = Object.entries(classified).map(([gmailMessageId, category]) => ({ gmailMessageId, category }));
  if (toCreate.length > 0) {
    await db.emailClassification.createMany({ data: toCreate, skipDuplicates: true });
  }

  for (const e of uncached) {
    result[e.id] = classified[e.id] ?? "CAN_WAIT";
  }
  return result;
}
