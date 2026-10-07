import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

const CLAUDE_MODEL = "claude-sonnet-5-5";

// The email that invites the client to a call where the brand guides, research reports and mock-ups are presented.
export async function draftBookCallEmail(db: PrismaClient, projectId: string): Promise<{ to: string; subject: string; body: string } | { error: string }> {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { contact: true, phases: { select: { name: true } } } });
  if (!project) return { error: "Project not found." };
  const setting = await db.integrationSetting.findUnique({ where: { provider: "anthropic" } });
  if (!setting?.apiKeyEncrypted) return { error: "No Anthropic API key configured: add one in Settings first." };
  const apiKey = await decryptSecret(setting.apiKeyEncrypted);

  const c = project.contact;
  const fr = (c.locale ?? "").toLowerCase().startsWith("fr");
  const first = c.firstName || c.company || "";
  const names = project.phases.map((p) => p.name.toLowerCase());
  const items = [
    names.some((n) => n.includes("brand")) ? "the brand guides" : "",
    names.some((n) => n.includes("research")) ? "the research reports" : "",
    names.some((n) => n.includes("mock-up")) ? "the mock-ups" : "",
  ].filter(Boolean);

  const prompt = `Write a short, warm, professional email from Andrew Murphy (AMO, a consultant who builds websites, funnels, blogs and apps and deploys AI tools) to ${first || "the client"}${c.company ? ` (${c.company})` : ""}.
Purpose: the work on the project "${project.name}" is ready, and Andrew wants to book a call to present ${items.length ? items.join(", ") : "the deliverables"} and get approval before the next step (2nd instalment).
Write it in ${fr ? "French (Québec, use \"vous\")" : "English"}. 90 to 140 words. Invite them to reply with 2 or 3 times that suit them, or to pick a slot; do not invent a booking link, prices or dates. Sign "Andrew Murphy".
Reply with JSON only, no code fence: {"subject": "...", "body": "..."} (use \\n for line breaks in body).`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { error: `The AI request failed (HTTP ${res.status}). Check the Anthropic API key in Settings and try again.` };
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((x) => x.type === "text")?.text ?? "";
    const m = /\{[\s\S]*\}/.exec(text);
    const json = m ? (JSON.parse(m[0]) as { subject?: string; body?: string }) : null;
    if (!json?.subject || !json.body) return { error: "The AI's answer could not be read. Try again." };
    return { to: c.email ?? "", subject: json.subject, body: json.body };
  } catch (e) {
    return { error: `Could not generate the email (${e instanceof Error ? e.message.slice(0, 100) : "unknown error"}).` };
  }
}
