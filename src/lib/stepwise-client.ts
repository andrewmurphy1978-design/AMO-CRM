"use client";

// Drives a report that is written by AI in small parallel requests (see the brand guide and research report
// routes): start (checks) -> every part in English and French, 4 at a time (each retried once) -> finish.
export async function runStepwiseReport(
  url: string,
  fr: boolean,
  onProgress: (text: string) => void,
  finishKey: "guides" | "parts",
  // Lay out one language per request (heavy PDFs): { step: "finish", lang, parts: { [lang]: ... } }
  finishPerLang = false
): Promise<{ error?: string; fileNames?: string[] }> {
  type Reply = { error?: string; parts?: number; content?: Record<string, unknown>; fileNames?: string[] };
  const call = async (payload: object): Promise<Reply> => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const text = await res.text();
    try {
      return JSON.parse(text) as Reply;
    } catch {
      return { error: `${fr ? "Réponse inattendue du serveur" : "Unexpected server response"} (HTTP ${res.status}${text ? `: ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}` : ""})` };
    }
  };
  const lost = (e: unknown) => `${fr ? "Connexion interrompue" : "Connection interrupted"} (${e instanceof Error ? e.message : "network"})`;

  onProgress(fr ? "Vérification…" : "Checking…");
  let start: Reply;
  try {
    start = await call({ step: "start" });
  } catch (e) {
    return { error: lost(e) };
  }
  if (start.error || !start.parts) return { error: start.error ?? "Error" };

  const total = start.parts * 2;
  let done = 0;
  const label = fr ? "Rédaction par l'IA" : "Writing with AI";
  onProgress(`${label} 0/${total}`);
  const results: { en: Record<string, unknown>[]; fr: Record<string, unknown>[] } = { en: [], fr: [] };
  const run = async (lang: "en" | "fr", part: number): Promise<string | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await call({ step: "part", lang, part });
        if (r.content) {
          results[lang][part] = r.content;
          onProgress(`${label} ${++done}/${total}`);
          return null;
        }
        if (attempt === 1) return r.error ?? "Error";
      } catch (e) {
        if (attempt === 1) return lost(e);
      }
    }
    return "Error";
  };
  const queue = (["en", "fr"] as const).flatMap((lang) => Array.from({ length: start.parts! }, (_, p) => ({ lang, p })));
  const errors: string[] = [];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const e = await run(job.lang, job.p);
        if (e) errors.push(e);
      }
    })
  );
  if (errors.length > 0) return { error: `${fr ? "L'IA n'a pas pu rédiger toutes les parties" : "The AI couldn't write every part"}: ${errors[0]}` };

  onProgress(fr ? "Mise en page des PDF…" : "Laying out the PDFs…");
  try {
    if (finishPerLang) {
      const names: string[] = [];
      for (const lang of ["en", "fr"] as const) {
        onProgress(`${fr ? "Mise en page des PDF" : "Laying out the PDFs"} ${lang === "en" ? "1" : "2"}/2…`);
        const res = await call({ step: "finish", lang, [finishKey]: { [lang]: results[lang] } });
        if (res.error) return { error: res.error };
        names.push(...(res.fileNames ?? []));
      }
      return { fileNames: names };
    }
    const res = await call({ step: "finish", [finishKey]: results });
    return res.error ? { error: res.error } : { fileNames: res.fileNames };
  } catch (e) {
    return { error: lost(e) };
  }
}
