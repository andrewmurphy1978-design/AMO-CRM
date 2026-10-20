import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

// A quote is client-facing business content, not bulk triage — worth a
// stronger model than the Haiku one email-classifier.ts uses.
// Sonnet: quick enough for an interactive "Generate" click while still writing
// client-facing copy well.
const CLAUDE_MODEL = "claude-sonnet-5-5";

export interface AIProposalDraft {
  coverLetter: string;
  // `section` (0-based) is set when the proposal is split into sections.
  lineItems: { description: string; details?: string; quantity: number; unitPrice: number; section?: number }[];
  subscriptions?: { name: string; amount: number; period: string; note: string }[];
  // Shown to the consultant after drafting (e.g. when live price lookup was unavailable).
  notice?: string;
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
  sections?: { title: string; kind: string }[];
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

  const sectionsText =
    input.sections && input.sections.length > 0
      ? `\nThe proposal is split into sections, and every line item belongs to exactly one of them. Add "section": <number> to each line item:\n${input.sections
          .map((s, i) => `${i}: ${s.title}${s.kind === "PREP" ? " (brand, research and mock-up work)" : " (the build, presentation and launch of this type of work)"}`)
          .join("\n")}\n`
      : "";

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
${sectionsText}
Keep it tight: details at most 2 short sentences, at most 12 line items, no repetition of the brief. Respond with ONLY a JSON object, no markdown fences, no other text, in exactly this shape:
{"coverLetter": "...", "lineItems": [{"description": "...", "details": "...", "quantity": 1, "unitPrice": 0${input.sections?.length ? ', "section": 0' : ""}}]}`;
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

// ---- Step-by-step drafting (the form calls these one after the other and shows a progress report).
// Nothing here persists anything: the consultant reviews and edits the result before saving.

export interface AIContext {
  clientLabel: string;
  projectName: string;
  currency: string;
  language: "en" | "fr";
  brief: string;
  sections?: { title: string; kind: string }[];
}

export interface AIApp {
  name: string;
  plan: string;
  period: "month" | "year" | "once";
}

async function askClaude(db: PrismaClient, prompt: string, opts: { search?: boolean; language: "en" | "fr" }): Promise<{ text: string; notice?: string } | { error: string }> {
  const apiKey = await getStoredApiKey(db);
  if (!apiKey) return { error: "No Anthropic API key configured — add one in Settings first." };

  const call = (messages: unknown[], withSearch: boolean) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 12000,
        messages,
        ...(withSearch ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }] } : {}),
      }),
      signal: AbortSignal.timeout(120_000),
    });

  type Block = { type: string; text?: string };
  type Reply = { content?: Block[]; stop_reason?: string };
  try {
    const messages: unknown[] = [{ role: "user", content: prompt }];
    let withSearch = Boolean(opts.search);
    let notice: string | undefined;
    let data: Reply = {};
    // A long search may pause the turn: send it back to continue (a few times at most).
    for (let turn = 0; turn < 4; turn++) {
      let res = await call(messages, withSearch);
      if (!res.ok && withSearch && res.status === 400) {
        // Web search isn't enabled for this API key / organization: answer with estimated prices instead.
        console.error("proposal-ai: web search unavailable, retrying without it:", (await res.text()).slice(0, 300));
        withSearch = false;
        notice =
          opts.language === "fr"
            ? "Les prix des applications sont des estimations : la recherche web n'est pas activée pour votre clé API Anthropic (console.anthropic.com > Paramètres > Recherche web)."
            : "App and membership prices are estimates: web search isn't enabled for your Anthropic API key (console.anthropic.com > Settings > Web search).";
        res = await call(messages, false);
      }
      if (!res.ok) {
        const body = await res.text();
        console.error("proposal-ai: Anthropic API returned", res.status, body);
        return { error: `The AI request failed (HTTP ${res.status}: ${body.slice(0, 160)}) — check the Anthropic API key in Settings and try again.` };
      }
      data = (await res.json()) as Reply;
      if (data.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: data.content });
    }
    if (data.stop_reason === "max_tokens") return { error: "The AI's reply was cut off — try again, or write a short brief to keep it concise." };
    // With searches in the reply, the JSON is in the last text block.
    const text = [...(data.content ?? [])].reverse().find((c) => c.type === "text" && c.text?.includes("{"))?.text ?? "";
    return { text, notice };
  } catch (error) {
    console.error("proposal-ai: request failed", error);
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { error: "The AI took too long to answer — try again, or type a short brief to speed it up." };
    }
    return { error: `Something went wrong with the AI request — try again. (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"})` };
  }
}

// Step: the cover letter and the priced line items.
export async function draftLetterAndItems(
  db: PrismaClient,
  input: AIContext & { servicesCatalog: { name: string; description: string | null; unitPrice: number; currency: string; unit: string | null }[] }
): Promise<{ coverLetter: string; lineItems: NonNullable<AIProposalDraft["lineItems"]> } | { error: string }> {
  const reply = await askClaude(db, buildPrompt(input), { language: input.language });
  if ("error" in reply) return reply;
  try {
    const parsed = parseLooseJson(reply.text) as {
      coverLetter?: string;
      lineItems?: { description?: string; details?: string; quantity?: number; unitPrice?: number; section?: number }[];
    };
    const lineItems = (parsed.lineItems ?? [])
      .filter((li) => li.description && typeof li.unitPrice === "number")
      .map((li) => ({
        description: li.description!,
        details: li.details?.trim() || undefined,
        quantity: typeof li.quantity === "number" && li.quantity > 0 ? li.quantity : 1,
        unitPrice: li.unitPrice!,
        ...(input.sections?.length
          ? { section: Number.isInteger(li.section) && (li.section as number) >= 0 && (li.section as number) < input.sections.length ? (li.section as number) : Math.max(0, input.sections.findIndex((x) => x.kind !== "PREP")) }
          : {}),
      }));
    if (lineItems.length === 0) return { error: "The AI didn't return any usable line items — try describing the work in more detail." };
    return { coverLetter: parsed.coverLetter?.trim() ?? "", lineItems };
  } catch (error) {
    console.error("proposal-ai: unreadable reply", error);
    return { error: "The AI's reply couldn't be read — try again." };
  }
}

// Step: which third-party apps / memberships / services the client must pay the providers for.
export async function listRequiredApps(db: PrismaClient, input: AIContext & { lineItems: { description: string }[] }): Promise<{ apps: AIApp[] } | { error: string }> {
  const prompt = `A freelance consultant is preparing this client proposal.

Project: ${input.projectName} (client: ${input.clientLabel})
What the project involves:
${input.brief}

The work being quoted:
${input.lineItems.map((li) => `- ${li.description}`).join("\n")}

List EVERY third-party app, platform, membership, subscription or service the client will have to pay the providers directly to run this project (for example the website / funnel app such as Systeme.io or ClickFunnels, hosting, a domain name, email / automation tools, plugins, memberships). For each, give the provider's name, the plan that best fits this project, and the billing period ("month", "year" or "once"). Only list what the project truly needs, at most 10, no duplicates, and nothing that the consultant already charges for in the work above.

Respond with ONLY a JSON object, no markdown fences, no other text, in exactly this shape:
{"apps": [{"name": "...", "plan": "...", "period": "month"}]}`;
  const reply = await askClaude(db, prompt, { language: input.language });
  if ("error" in reply) return reply;
  try {
    const parsed = parseLooseJson(reply.text) as { apps?: { name?: string; plan?: string; period?: string }[] };
    const apps = (parsed.apps ?? [])
      .filter((a) => a.name)
      .slice(0, 10)
      .map((a) => ({ name: a.name!, plan: a.plan?.trim() ?? "", period: (["month", "year", "once"].includes(a.period ?? "") ? a.period : "month") as AIApp["period"] }));
    return { apps };
  } catch (error) {
    console.error("proposal-ai: unreadable apps reply", error);
    return { apps: [] };
  }
}

// Step (one per app): the current public price, looked up on the web when available.
export async function priceApp(db: PrismaClient, input: { app: AIApp; currency: string; language: "en" | "fr" }): Promise<{ subscription: { name: string; amount: number; period: string; note: string }; notice?: string } | { error: string }> {
  const prompt = `Find the CURRENT public price of "${input.app.name}"${input.app.plan ? ` (plan: ${input.app.plan})` : ""} on the provider's own pricing page, using web search. Give the price in ${input.currency} (convert if the provider's price is in another currency) for the billing period "${input.app.period}" (if the provider only sells another period, convert sensibly and say so in the note). If the plan named above does not exist, pick the closest one. If no public price can be found, use amount 0 and say so in the note.

Respond with ONLY a JSON object, no markdown fences, no other text, in exactly this shape:
{"name": "${input.app.name}${input.app.plan ? ` — ${input.app.plan}` : ""}", "amount": 0, "period": "${input.app.period}", "note": "plan and source site, e.g. Startup plan, systeme.io/pricing"}`;
  const reply = await askClaude(db, prompt, { search: true, language: input.language });
  if ("error" in reply) return reply;
  try {
    const parsed = parseLooseJson(reply.text) as { name?: string; amount?: number; period?: string; note?: string };
    return {
      subscription: {
        name: parsed.name?.trim() || input.app.name,
        amount: typeof parsed.amount === "number" && parsed.amount >= 0 ? parsed.amount : 0,
        period: ["month", "year", "once"].includes(parsed.period ?? "") ? (parsed.period as string) : input.app.period,
        note: parsed.note?.trim() ?? "",
      },
      notice: reply.notice,
    };
  } catch {
    return { subscription: { name: input.app.name, amount: 0, period: input.app.period, note: input.language === "fr" ? "Prix introuvable" : "Price not found" }, notice: reply.notice };
  }
}
