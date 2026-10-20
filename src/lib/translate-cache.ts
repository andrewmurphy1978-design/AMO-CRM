import type { PrismaClient } from "@/lib/prisma";
import { askClaude } from "@/lib/proposal-ai";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseItems(text: string): { i: number; fr: string }[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { items?: { i?: number; fr?: string }[] };
    return (parsed.items ?? []).filter((x): x is { i: number; fr: string } => Number.isInteger(x.i) && typeof x.fr === "string");
  } catch {
    return [];
  }
}

/**
 * French versions of free texts (source text -> French). Cached by text, so each text is translated once; only
 * the texts not seen before go to the AI, in batches. If the AI is unavailable the missing texts are simply left
 * out of the result (the caller keeps the original), so a PDF is never blocked by a translation.
 */
export async function translateToFrench(db: PrismaClient, texts: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(texts.map((t) => t.trim()).filter((t) => /\p{L}/u.test(t)))];
  if (unique.length === 0) return out;

  const hashes = await Promise.all(unique.map(sha256));
  const cached = await db.translationCache.findMany({ where: { lang: "fr", sourceHash: { in: hashes } }, select: { sourceHash: true, translated: true } });
  const byHash = new Map(cached.map((c) => [c.sourceHash, c.translated]));
  const missing: { text: string; hash: string }[] = [];
  unique.forEach((text, i) => {
    const hit = byHash.get(hashes[i]);
    if (hit) out.set(text, hit);
    else missing.push({ text, hash: hashes[i] });
  });

  for (let i = 0; i < missing.length; i += 20) {
    const batch = missing.slice(i, i + 20);
    const prompt = `Translate these texts from a client proposal / invoice into natural, professional French (Quebec business French). Keep names of people, companies, products and brands (Systeme.io, ClickFunnels, Zapier...), numbers, currency amounts and line breaks as they are. If a text is already in French, return it unchanged.

${JSON.stringify(batch.map((b, n) => ({ i: n, text: b.text })))}

Respond with ONLY a JSON object, no markdown fences, no other text, in exactly this shape:
{"items": [{"i": 0, "fr": "..."}]}`;
    const reply = await askClaude(db, prompt, { language: "fr" });
    if ("error" in reply) {
      console.error("translate-cache: translation unavailable:", reply.error);
      break;
    }
    for (const row of parseItems(reply.text)) {
      const src = batch[row.i];
      if (!src || !row.fr.trim()) continue;
      out.set(src.text, row.fr.trim());
      await db.translationCache.upsert({
        where: { lang_sourceHash: { lang: "fr", sourceHash: src.hash } },
        update: { translated: row.fr.trim(), source: src.text },
        create: { lang: "fr", sourceHash: src.hash, source: src.text, translated: row.fr.trim() },
      });
    }
  }
  return out;
}
