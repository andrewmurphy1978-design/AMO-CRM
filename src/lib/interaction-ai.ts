import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

// A short summary of a call / meeting / text thread, from its notes or pasted transcript.
// Quick and cheap: the smaller model is plenty for summarising.
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

export async function summarizeInteractionWithAI(db: PrismaClient, input: { notes: string; subject?: string | null; type: string }): Promise<{ summary: string } | { error: string }> {
  const setting = await db.integrationSetting.findUnique({ where: { provider: "anthropic" } });
  const apiKey = setting?.apiKeyEncrypted ? await decryptSecret(setting.apiKeyEncrypted) : null;
  if (!apiKey) return { error: "No Anthropic API key configured — add one in Settings first." };

  const kind = input.type === "SMS" ? "text message conversation" : input.type === "MEETING" ? "meeting" : input.type === "CALL" ? "phone call" : "note";
  const prompt = `Summarise this ${kind}${input.subject ? ` ("${input.subject}")` : ""} for a CRM record. Write the summary in the SAME language as the text below. Be concise and factual: 3 to 6 short bullet lines starting with "- " covering what was discussed, decisions made, and any follow-up actions with who/when if mentioned. No introduction, no headings, nothing invented.

Text:
${input.notes.slice(0, 60000)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("interaction-ai: Anthropic API returned", res.status, body);
      return { error: `The AI request failed (HTTP ${res.status}) — check the Anthropic API key in Settings and try again.` };
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
    return text ? { summary: text } : { error: "The AI returned an empty summary — try again." };
  } catch (error) {
    console.error("interaction-ai: failed", error);
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return { error: "The AI took too long to answer — try again." };
    return { error: `Something went wrong generating the summary. (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"})` };
  }
}
