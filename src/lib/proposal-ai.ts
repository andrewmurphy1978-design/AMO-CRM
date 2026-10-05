import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

// A quote is client-facing business content, not bulk triage — worth a
// stronger model than the Haiku one email-classifier.ts uses.
// Sonnet: quick enough for an interactive "Generate" click while still writing
// client-facing copy well.
const CLAUDE_MODEL = "claude-sonnet-5-5";

export interface AIProposalDraft {
  coverLetter: string;
  lineItems: { description: string; details?: string; quantity: number; unitPrice: number }[];
  subscriptions?: { name: string; amount: number; period: string; note: string }[];
}

// Same key source as email-classifier.ts (Settings > Anthropic API key,
// stored encrypted) — kept as its own copy rather than a shared import
// since the two callers have no other reason to depend on each other.
async function getStoredApiKey(db: PrismaClient): Promise<string | null> {
  const setting = await db.integrationSetting.findUnique({ where: { provider: "anthropic" } });
  if (!setting?.apiKeyEncrypted) return null;
  return decryptSecret(setting.apiKeyEncrypted);
}

function buildPrompt(input: {
  clientLabel: string;
  projectName: string;
  currency: string;
  servicesCatalog: { name: string; description: string | null; unitPrice: number; currency: string; unit: string | null }[];
  brief: string;
  language: "en" | "fr";
}): string {
  const catalogText =
    input.servicesCatalog.length > 0
      ? input.servicesCatalog
          .map(
            (s) =>
              `- ${s.name}: ${s.unitPrice} ${s.currency}${s.unit ? ` / ${s.unit}` : ""}${s.description ? ` — ${s.description}` : ""}`
          )
          .join("\n")
      : "(no price list entries on file — invent reasonable line items and prices)";

  return `You are helping a freelance consultant (AI courses/coaching, affiliate marketing, ClickFunnels funnel building, website building, and social media services) draft a client proposal.

Client: ${input.clientLabel}
Project: ${input.projectName}
Proposal currency: ${input.currency}

The consultant's usual service price list (prices are in the currency shown per item, not necessarily the proposal's currency — convert reasonably if the proposal currency differs):
${catalogText}

What the consultant told you about this client's needs:
${input.brief}

Write:
1. A warm, professional cover letter (3-5 short paragraphs) introducing the proposal to the client, written in ${input.language === "fr" ? "French" : "English"}, in the voice described in the client background if any. Start with a greeting using the client's first name and end with a short sign-off from Andrew Murphy, Andrew Murphy Online.
2. A list of line items covering the work described, each with a short description (the item name), "details" (1-3 sentences saying exactly what is included, written for the client), a quantity, and a unit price in ${input.currency}. Prefer matching existing price list items where they fit; add new reasonably-priced items for anything not covered.
3. "subscriptions": the third-party apps / services the client will pay the providers directly for this project (for example the website/funnel app, hosting, domain, automation tools), each with name, amount (best estimate, 0 if unknown), period ("month", "year" or "once") and a short note. Leave the list empty if none apply.

Keep it tight: details at most 2 short sentences, at most 12 line items, no repetition of the brief. Respond with ONLY a JSON object, no markdown fences, no other text, in exactly this shape:
{"coverLetter": "...", "lineItems": [{"description": "...", "details": "...", "quantity": 1, "unitPrice": 0}], "subscriptions": [{"name": "...", "amount": 0, "period": "month", "note": ""}]}`;
}

// The model sometimes wraps JSON in code fences or adds a sentence around it,
// and can leave raw line breaks inside a string (invalid JSON). Take the
// outermost {...} and escape line breaks that sit inside strings.
function parseLooseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in the reply");
  const body = text.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    let out = "";
    let inString = false;
    let escaped = false;
    for (const ch of body) {
      if (inString) {
        if (escaped) {
          escaped = false;
          out += ch;
        } else if (ch === "\\") {
          escaped = true;
          out += ch;
        } else if (ch === '"') {
          inString = false;
          out += ch;
        } else if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "";
        else if (ch === "\t") out += "\\t";
        else out += ch;
      } else {
        if (ch === '"') inString = true;
        out += ch;
      }
    }
    return JSON.parse(out);
  }
}

// Never persists anything — returns a draft for the Proposal form to
// pre-fill, which the consultant reviews and edits before saving.
export async function draftProposalWithAI(
  db: PrismaClient,
  input: {
    clientLabel: string;
    projectName: string;
    currency: string;
    servicesCatalog: { name: string; description: string | null; unitPrice: number; currency: string; unit: string | null }[];
    brief: string;
    language: "en" | "fr";
  }
): Promise<AIProposalDraft | { error: string }> {
  const apiKey = await getStoredApiKey(db);
  if (!apiKey) return { error: "No Anthropic API key configured — add one in Settings first." };

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
        max_tokens: 12000,
        messages: [{ role: "user", content: buildPrompt(input) }],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("proposal-ai: Anthropic API returned", res.status, body);
      return { error: `The AI request failed (HTTP ${res.status}: ${body.slice(0, 160)}) — check the Anthropic API key in Settings and try again.` };
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const rawText = data.content?.find((c) => c.type === "text")?.text ?? "";
    if (data.stop_reason === "max_tokens") {
      console.error("proposal-ai: reply was cut off (max_tokens)");
      return { error: "The AI's reply was cut off — try again, or write a short brief to keep it concise." };
    }
    const parsed = parseLooseJson(rawText) as {
      coverLetter?: string;
      lineItems?: { description?: string; details?: string; quantity?: number; unitPrice?: number }[];
      subscriptions?: { name?: string; amount?: number; period?: string; note?: string }[];
    };

    const lineItems = (parsed.lineItems ?? [])
      .filter((li) => li.description && typeof li.unitPrice === "number")
      .map((li) => ({
        description: li.description!,
        details: li.details?.trim() || undefined,
        quantity: typeof li.quantity === "number" && li.quantity > 0 ? li.quantity : 1,
        unitPrice: li.unitPrice!,
      }));

    if (lineItems.length === 0) {
      return { error: "The AI didn't return any usable line items — try describing the work in more detail." };
    }

    const subscriptions = (parsed.subscriptions ?? [])
      .filter((x) => x.name)
      .map((x) => ({ name: x.name!, amount: typeof x.amount === "number" && x.amount >= 0 ? x.amount : 0, period: ["month", "year", "once"].includes(x.period ?? "") ? x.period! : "month", note: x.note ?? "" }));

    return { coverLetter: parsed.coverLetter?.trim() ?? "", lineItems, subscriptions };
  } catch (error) {
    console.error("proposal-ai: failed to draft proposal", error);
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { error: "The AI took too long to answer (over 55 s) — try again, or type a short brief to speed it up." };
    }
    return { error: `Something went wrong drafting the proposal — try again. (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"})` };
  }
}
