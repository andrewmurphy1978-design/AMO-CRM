import type { PrismaClient } from "@/lib/prisma";
import type { EmailSummary } from "@/lib/google";
import { decryptSecret } from "@/lib/crypto";

export type EmailCategory = "NEEDS_REPLY" | "NEEDS_ATTENTION" | "CAN_WAIT" | "LOW_PRIORITY";

const VALID_CATEGORIES: EmailCategory[] = ["NEEDS_REPLY", "NEEDS_ATTENTION", "CAN_WAIT", "LOW_PRIORITY"];

// Fast, cheap model — this is a bulk triage call over a snippet-length
// amount of text per message, not a task that needs Sonnet-level judgment.
// No date suffix: that's the current model id, and a dated variant returns
// a 404 (which — before the error logging above existed — silently landed
// everything in the CAN_WAIT fallback with no visible sign why).
const CLAUDE_MODEL = "claude-haiku-4-5";

function buildPrompt(emails: { id: string; from: string; subject: string; snippet: string }[]): string {
  const list = emails
    .map((e, i) => `${i + 1}. id: ${e.id}\n   From: ${e.from}\n   Subject: ${e.subject}\n   Snippet: ${e.snippet}`)
    .join("\n\n");
  return `You are triaging an inbox for a busy small-business owner and parent. For each email below, classify it into exactly one of these four categories:

- NEEDS_REPLY: the sender is waiting on a response, answer, or action from the recipient (a question, a request, a client asking something).
- NEEDS_ATTENTION: important and needs the recipient's attention or action soon, but doesn't require writing a reply (an urgent alert, a bill due, a booking confirmation, a deadline reminder).
- CAN_WAIT: worth reading eventually but not urgent (school/parent-association newsletters, community updates, general FYI messages).
- LOW_PRIORITY: no real importance (marketing newsletters, promotional offers, automated receipts/invoices, notifications needing no action).

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
  apiKey: string | null
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
        max_tokens: Math.max(256, emails.length * 20),
        messages: [{ role: "user", content: buildPrompt(emails) }],
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
    // Claude sometimes wraps JSON in a markdown fence despite being told
    // not to — strip ```json / ``` fences before parsing, and fall back to
    // pulling out the first {...} block if that still doesn't parse.
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, string>;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error("email-classifier: couldn't find JSON in response:", rawText);
        return {};
      }
      parsed = JSON.parse(match[0]) as Record<string, string>;
    }

    const result: Record<string, EmailCategory> = {};
    for (const [id, category] of Object.entries(parsed)) {
      if (VALID_CATEGORIES.includes(category as EmailCategory)) {
        result[id] = category as EmailCategory;
      }
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
  emails: EmailSummary[]
): Promise<Record<string, EmailCategory>> {
  if (emails.length === 0) return {};

  const ids = emails.map((e) => e.id);
  const cached = await db.emailClassification.findMany({ where: { gmailMessageId: { in: ids } } });
  const result: Record<string, EmailCategory> = {};
  for (const c of cached) result[c.gmailMessageId] = c.category as EmailCategory;

  const uncached = emails.filter((e) => !(e.id in result));
  if (uncached.length === 0) return result;

  const apiKey = (await getStoredApiKey(db)) ?? process.env.ANTHROPIC_API_KEY ?? null;
  const classified = await callClaude(
    uncached.map((e) => ({ id: e.id, from: e.from, subject: e.subject, snippet: e.snippet })),
    apiKey
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
