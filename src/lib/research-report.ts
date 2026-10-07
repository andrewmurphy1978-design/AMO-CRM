import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { readZip } from "@/lib/zip-read";
import { onTaskDone } from "@/lib/task-schedule";
import { syncProjectLifecycle } from "@/lib/project-progress";

// Research phase: the AI research reports (Markdown + a zip of screenshots) are dropped on the project's
// Research card; what they hold is checked (competitors, screenshots, keywords), the tasks they cover are
// ticked, and one final report, merged from all of them, is written in English and French (two PDFs).

// ---- reading a report ----------------------------------------------------------------

export interface ResearchAnalysis {
  competitors: { name: string; url: string }[];
  screenshots: number;
  keywords: number;
  blogs: number;
  contentPlan: number;
  sections: string[];
}

const strip = (s: string) => s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim();

// The rows of the first table under a heading that matches `heading`.
export function tableUnder(md: string, heading: RegExp): { header: string[]; rows: string[][] } | null {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let i = lines.findIndex((l) => /^#{1,6}\s/.test(l) && heading.test(l));
  if (i < 0) return null;
  for (i++; i < lines.length && !/^#{1,6}\s/.test(lines[i]); i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => strip(c));
    const header = cells(lines[i]);
    const rows: string[][] = [];
    for (let j = i + 1; j < lines.length && lines[j].trim().startsWith("|"); j++) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[j])) continue;
      rows.push(cells(lines[j]));
    }
    return { header, rows };
  }
  return null;
}

export function analyseResearchReport(md: string): ResearchAnalysis {
  const comp = tableUnder(md, /competitors?(?!\s*blog)|concurrents?(?!\s*blog)/i);
  const urlCol = comp ? comp.header.findIndex((h) => /url|site|web/i.test(h)) : -1;
  const competitors = (comp?.rows ?? []).filter((r) => r[0]).map((r) => ({ name: r[0], url: urlCol >= 0 ? r[urlCol] ?? "" : "" }));
  const shots = tableUnder(md, /screenshot|capture/i);
  const sections = md.split("\n").filter((l) => /^##\s/.test(l)).map((l) => l.replace(/^##\s+/, "").trim());
  const rows = (re: RegExp) => tableUnder(md, re)?.rows.filter((r) => r[0]).length ?? 0;
  return { competitors, screenshots: shots?.rows.length ?? 0, keywords: rows(/keyword|mots-cl/i), blogs: rows(/competitor blog|blogue/i), contentPlan: rows(/content plan|plan de contenu/i), sections };
}

// ---- ticking the research tasks ---------------------------------------------------------

const PHASE = /(^|—\s*)research$/i;

export async function tickResearchTasks(db: PrismaClient, projectId: string, checks: { match: RegExp; ok: boolean; label: string; why: string }[]): Promise<{ verified: string[]; missing: string[] }> {
  const verified: string[] = [];
  const missing: string[] = [];
  const phases = await db.projectPhase.findMany({ where: { projectId }, select: { name: true, tasks: { select: { id: true, title: true, status: true } } } });
  let changed = false;
  for (const phase of phases.filter((p) => PHASE.test(p.name.trim()))) {
    for (const task of phase.tasks) {
      const c = checks.find((x) => x.match.test(task.title.trim()));
      if (!c || task.status === "DONE") continue;
      if (c.ok) {
        await db.task.update({ where: { id: task.id }, data: { status: "DONE", completedAt: new Date() } });
        await onTaskDone(db, task.id);
        if (!verified.includes(c.label)) verified.push(c.label);
        changed = true;
      } else if (!missing.includes(`${c.label}: ${c.why}`)) missing.push(`${c.label}: ${c.why}`);
    }
  }
  if (changed) await syncProjectLifecycle(db, projectId);
  return { verified, missing };
}

export interface ResearchResult {
  competitors: number;
  keywords: number;
  blogs: number;
  contentPlan: number;
  verified: string[];
  missing: string[];
}

export async function processResearchReport(db: PrismaClient, projectId: string, md: string): Promise<ResearchResult> {
  const a = analyseResearchReport(md);
  const { verified, missing } = await tickResearchTasks(db, projectId, [
    { match: /^find (competitors|competing apps)/i, ok: a.competitors.length > 0, label: "Find competitors", why: "the report has no Competitors table with rows" },
    { match: /^research keywords/i, ok: a.keywords > 0, label: "Research keywords", why: "the report has no Keywords table with rows" },
    { match: /^review competitor blogs/i, ok: a.blogs > 0, label: "Review competitor blogs", why: "the report has no Competitor blogs table with rows" },
    { match: /^produce content plan/i, ok: a.contentPlan > 0, label: "Produce content plan", why: "the report has no Content plan table with rows" },
  ]);
  return { competitors: a.competitors.length, keywords: a.keywords, blogs: a.blogs, contentPlan: a.contentPlan, verified, missing };
}

// The screenshots of the AI's research zip (PNG / JPG) are kept on the project (shown in the Research card
// and drawn in the final report).
export async function importResearchZip(db: PrismaClient, projectId: string, zip: Uint8Array): Promise<{ added: number; skipped: string[] }> {
  const { entries, skipped } = await readZip(zip);
  const existing = new Set((await db.attachedFile.findMany({ where: { projectId, kind: "RESEARCH_SHOT" }, select: { name: true } })).map((f) => f.name.toLowerCase()));
  let added = 0;
  for (const e of entries) {
    const ext = (e.name.split(".").pop() ?? "").toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : null;
    if (!mime) continue;
    if (e.data.length > 900_000) {
      skipped.push(`${e.name} (over 900 KB)`);
      continue;
    }
    if (added >= 40) {
      skipped.push(`${e.name} (more than 40 screenshots)`);
      continue;
    }
    const name = (e.name.split("/").pop() ?? e.name).slice(0, 160);
    if (existing.has(name.toLowerCase())) continue;
    existing.add(name.toLowerCase());
    await db.attachedFile.create({ data: { projectId, kind: "RESEARCH_SHOT", name, mimeType: mime, size: e.data.length, data: e.data as never, uploadedByName: "AI research" } });
    added++;
  }
  if (added > 0) await tickResearchTasks(db, projectId, [{ match: /^take screenshots/i, ok: true, label: "Take screenshots", why: "" }]);
  return { added, skipped };
}

// ---- the final report: written by Claude in small parts, drawn here ------------------------

export interface ResearchDoc {
  executiveSummary?: string[];
  positioning?: string;
  audience?: string;
  competitors?: { name: string; url?: string; type?: string; offer?: string; pricing?: string; positioning?: string; strengths?: string; weaknesses?: string; notes?: string }[];
  design?: { intro?: string; patterns?: string[] };
  keywords?: { keyword: string; intent?: string; volume?: string; difficulty?: string; priority?: string }[];
  competitorBlogs?: { competitor: string; blogUrl?: string; topics?: string; frequency?: string; formats?: string; gaps?: string }[];
  contentPlan?: { title: string; keyword?: string; format?: string; language?: string; priority?: string }[];
  gaps?: string[];
  recommendations?: { title: string; description: string }[];
  risks?: string[];
  nextSteps?: string[];
}

export const RESEARCH_PARTS: { id: string; shape: string }[] = [
  { id: "summary", shape: '{"executiveSummary": ["5 short bullets"], "positioning": "the client\'s offer and positioning today (2 short paragraphs)", "audience": "audience and search intent (2 short paragraphs)"}' },
  { id: "competitors", shape: '{"competitors": [{"name": "", "url": "https://...", "type": "direct or indirect", "offer": "", "pricing": "", "positioning": "", "strengths": "", "weaknesses": "", "notes": "tech / SEO notes"}], "design": {"intro": "", "patterns": [""]}}' },
  { id: "seo", shape: '{"keywords": [{"keyword": "", "intent": "", "volume": "", "difficulty": "", "priority": "High/Medium/Low"}], "competitorBlogs": [{"competitor": "", "blogUrl": "", "topics": "", "frequency": "", "formats": "", "gaps": ""}], "contentPlan": [{"title": "", "keyword": "", "format": "", "language": "", "priority": ""}]}' },
  { id: "recommendations", shape: '{"gaps": [""], "recommendations": [{"title": "", "description": ""}], "risks": [""], "nextSteps": [""]}' },
];

export interface ResearchSources {
  apiKey: string;
  clientName: string;
  projectName: string;
  reports: string[];
}

export async function loadResearchSources(db: PrismaClient, projectId: string): Promise<ResearchSources | { error: string }> {
  const files = await db.attachedFile.findMany({
    where: { projectId, kind: "RESEARCH_REPORT", OR: [{ name: { endsWith: ".md", mode: "insensitive" } }, { name: { endsWith: ".markdown", mode: "insensitive" } }, { name: { endsWith: ".txt", mode: "insensitive" } }] },
    orderBy: { createdAt: "asc" },
    select: { data: true },
  });
  const reports = files.map((f) => new TextDecoder("utf-8").decode(f.data as unknown as Uint8Array));
  if (reports.length === 0) return { error: "Drop the AI research report (a Markdown .md file) on the Research card first." };
  const setting = await db.integrationSetting.findUnique({ where: { provider: "anthropic" } });
  if (!setting?.apiKeyEncrypted) return { error: "No Anthropic API key configured: add one in Settings first." };
  const p = await db.project.findUnique({ where: { id: projectId }, select: { name: true, contact: { select: { firstName: true, lastName: true, company: true } } } });
  const clientName = p?.contact.company || [p?.contact.firstName, p?.contact.lastName].filter(Boolean).join(" ") || "Client";
  return { apiKey: await decryptSecret(setting.apiKeyEncrypted), clientName, projectName: p?.name ?? "", reports };
}

export async function writeResearchPart(input: ResearchSources & { lang: "en" | "fr"; part: number }): Promise<Partial<ResearchDoc> | { error: string }> {
  const spec = RESEARCH_PARTS[input.part];
  if (!spec) return { error: "Unknown part." };
  const language = input.lang === "fr" ? "Canadian French (français du Québec, professional, with proper accents)" : "English";
  const reports = input.reports.map((r, i) => `=== RESEARCH REPORT ${i + 1} ===\n${r.slice(0, 22_000)}`).join("\n\n");
  const prompt = `You are writing part of the final RESEARCH REPORT of a client project, to be laid out as a designed PDF.

Client: ${input.clientName}. Project: ${input.projectName}.

Several research reports were written by different AI assistants. COMBINE them into ONE coherent report:
- Keep every useful finding from all the reports; merge duplicates (the same competitor under two spellings is ONE competitor: keep the most complete data from each); where they disagree keep what is best sourced and say "unverified" when it is not.
- Never mention the reports, the AIs or their differences. Do not invent competitors, prices or statistics that are not in the sources.
- Write all text in ${language}. Be concrete and complete, but keep each text short.

Respond with ONLY one JSON object (no markdown fences) in exactly this shape; use [] or "" when the sources say nothing:
${spec.shape}

${reports}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 4_500, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(85_000),
    });
    if (!res.ok) return { error: `The AI request failed (HTTP ${res.status}: ${(await res.text()).slice(0, 140)}).` };
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    if (data.stop_reason === "max_tokens") return { error: "The AI's reply was cut off." };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s < 0 || e <= s) return { error: "The AI didn't return usable content." };
    return JSON.parse(text.slice(s, e + 1)) as Partial<ResearchDoc>;
  } catch (err) {
    return { error: `The AI request failed (${err instanceof Error ? err.message : "error"}).` };
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);

export function normaliseResearch(raw: Partial<ResearchDoc>): ResearchDoc {
  const comps = Array.isArray(raw.competitors) ? raw.competitors : [];
  const seen = new Set<string>();
  return {
    executiveSummary: strs(raw.executiveSummary),
    positioning: str(raw.positioning),
    audience: str(raw.audience),
    competitors: comps
      .filter((c) => c && typeof c.name === "string" && c.name.trim())
      .filter((c) => (seen.has(c.name.trim().toLowerCase()) ? false : (seen.add(c.name.trim().toLowerCase()), true)))
      .map((c) => ({ name: c.name.trim(), url: str(c.url), type: str(c.type), offer: str(c.offer), pricing: str(c.pricing), positioning: str(c.positioning), strengths: str(c.strengths), weaknesses: str(c.weaknesses), notes: str(c.notes) })),
    design: { intro: str(raw.design?.intro), patterns: strs(raw.design?.patterns) },
    keywords: (Array.isArray(raw.keywords) ? raw.keywords : []).filter((k) => k && typeof k.keyword === "string" && k.keyword.trim()).map((k) => ({ keyword: k.keyword, intent: str(k.intent), volume: str(k.volume), difficulty: str(k.difficulty), priority: str(k.priority) })),
    competitorBlogs: (Array.isArray(raw.competitorBlogs) ? raw.competitorBlogs : []).filter((b) => b && typeof b.competitor === "string" && b.competitor.trim()).map((b) => ({ competitor: b.competitor, blogUrl: str(b.blogUrl), topics: str(b.topics), frequency: str(b.frequency), formats: str(b.formats), gaps: str(b.gaps) })),
    contentPlan: (Array.isArray(raw.contentPlan) ? raw.contentPlan : []).filter((c) => c && typeof c.title === "string" && c.title.trim()).map((c) => ({ title: c.title, keyword: str(c.keyword), format: str(c.format), language: str(c.language), priority: str(c.priority) })),
    gaps: strs(raw.gaps),
    recommendations: (Array.isArray(raw.recommendations) ? raw.recommendations : []).filter((r) => r && typeof r.title === "string").map((r) => ({ title: r.title, description: str(r.description) ?? "" })),
    risks: strs(raw.risks),
    nextSteps: strs(raw.nextSteps),
  };
}

const T = {
  en: { report: "Research report", contents: "Contents", summary: "Executive summary", positioning: "Offer and positioning", audience: "Audience and search intent", competitors: "Competitor landscape", design: "Design and UX patterns", keywords: "Keywords and search intent", blogs: "Competitor blogs", plan: "Content plan", keyword: "Keyword", intent: "Intent", volume: "Volume", difficulty: "Difficulty", priority: "Priority", competitor: "Competitor", topics: "Topics", frequency: "Frequency", formats: "Formats", gapsCol: "Gaps", title: "Title", format: "Format", language: "Language", gaps: "Gaps and differentiators", recommendations: "Recommendations", risks: "Risks and open questions", next: "Next steps", screenshots: "Screenshots", offer: "Offer", pricing: "Pricing", pos: "Positioning", strengths: "Strengths", weaknesses: "Weaknesses", notes: "Notes", prepared: "Prepared by Andrew Murphy Online" },
  fr: { report: "Rapport de recherche", contents: "Table des matières", summary: "Sommaire exécutif", positioning: "Offre et positionnement", audience: "Public et intention de recherche", competitors: "Paysage concurrentiel", design: "Tendances de design et d'expérience", keywords: "Mots-clés et intention de recherche", blogs: "Blogues des concurrents", plan: "Plan de contenu", keyword: "Mot-clé", intent: "Intention", volume: "Volume", difficulty: "Difficulté", priority: "Priorité", competitor: "Concurrent", topics: "Sujets", frequency: "Fréquence", formats: "Formats", gapsCol: "Lacunes", title: "Titre", format: "Format", language: "Langue", gaps: "Lacunes et différenciateurs", recommendations: "Recommandations", risks: "Risques et questions ouvertes", next: "Prochaines étapes", screenshots: "Captures d'écran", offer: "Offre", pricing: "Prix", pos: "Positionnement", strengths: "Forces", weaknesses: "Faiblesses", notes: "Notes", prepared: "Préparé par Andrew Murphy Online" },
} as const;

const EXTRA = new Set("œŒšŠžŽŸ€‘’“”„•–—…™".split(""));
const ok = (t: string) => {
  let out = "";
  for (const ch of (t ?? "").replace(/ | /g, " ").replace(/[\r\t]/g, " ")) {
    const c = ch.codePointAt(0) ?? 0;
    out += ch === "\n" || (c >= 32 && c <= 255) || EXTRA.has(ch) ? ch : "?";
  }
  return out;
};

export async function renderResearchPdf(input: { doc: ResearchDoc; lang: "en" | "fr"; clientName: string; projectName: string; shots: { name: string; bytes: Uint8Array; kind: "png" | "jpg" }[] }): Promise<Uint8Array> {
  const t = T[input.lang];
  const d = input.doc;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const W = 595;
  const H = 842;
  const MX = 54;
  const CW = W - 2 * MX;
  const GREEN = rgb(0.06, 0.16, 0.11);
  const ACCENT = rgb(0.31, 0.76, 0.35);
  const INK = rgb(0.1, 0.11, 0.1);
  const SOFT = rgb(0.4, 0.43, 0.41);
  const LINE = rgb(0.85, 0.87, 0.86);
  let page!: PDFPage;
  let y = 0;
  let n = 0;
  const toc: { title: string; page: number }[] = [];
  const footer = (p: PDFPage, no: number) => {
    p.drawLine({ start: { x: MX, y: 36 }, end: { x: W - MX, y: 36 }, thickness: 0.5, color: LINE });
    p.drawText(ok(`${input.clientName}  -  ${t.report}`), { x: MX, y: 22, size: 8, font: regular, color: SOFT });
    p.drawText(String(no), { x: W - MX - regular.widthOfTextAtSize(String(no), 8), y: 22, size: 8, font: regular, color: SOFT });
  };
  const newPage = (title?: string) => {
    page = pdf.addPage([W, H]);
    n++;
    if (title) {
      toc.push({ title, page: n });
      page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: GREEN });
      page.drawRectangle({ x: 0, y: H - 82, width: W, height: 4, color: ACCENT });
      page.drawText(ok(title), { x: MX, y: H - 52, size: 22, font: bold, color: rgb(1, 1, 1) });
      y = H - 120;
    } else y = H - 60;
    footer(page, n);
  };
  const ensure = (h: number) => {
    if (y - h < 60) newPage();
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    for (const p of ok(text).split("\n")) {
      let line = "";
      for (const w of p.split(" ")) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) <= width) line = test;
        else {
          if (line) lines.push(line);
          line = w;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const para = (text: string | undefined, o: { font?: PDFFont; size?: number; x?: number; color?: ReturnType<typeof rgb> } = {}) => {
    if (!text) return;
    const size = o.size ?? 10.5;
    for (const p of text.split(/\n{2,}/)) {
      for (const ln of wrap(p, o.font ?? regular, size, CW - ((o.x ?? MX) - MX))) {
        ensure(size + 6);
        page.drawText(ln, { x: o.x ?? MX, y, size, font: o.font ?? regular, color: o.color ?? INK });
        y -= size + 5;
      }
      y -= 6;
    }
  };
  const bullets = (items: string[] | undefined) => {
    for (const it of items ?? []) {
      const lines = wrap(it, regular, 10.5, CW - 16);
      ensure(lines.length * 15 + 2);
      page.drawText("-", { x: MX + 2, y, size: 10.5, font: bold, color: ACCENT });
      for (const ln of lines) {
        page.drawText(ln, { x: MX + 16, y, size: 10.5, font: regular, color: INK });
        y -= 15;
      }
      y -= 2;
    }
    y -= 4;
  };
  const sub = (text: string) => {
    ensure(34);
    page.drawText(ok(text), { x: MX, y, size: 13, font: bold, color: GREEN });
    y -= 22;
  };

  // cover
  page = pdf.addPage([W, H]);
  n++;
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: GREEN });
  page.drawRectangle({ x: 0, y: H * 0.34, width: W, height: 5, color: ACCENT });
  page.drawText(ok(t.report), { x: MX, y: H * 0.34 + 150, size: 40, font: bold, color: rgb(1, 1, 1) });
  wrap(input.clientName, bold, 22, CW).forEach((ln, i) => page.drawText(ln, { x: MX, y: H * 0.34 + 110 - i * 28, size: 22, font: bold, color: ACCENT }));
  page.drawText(ok(input.projectName), { x: MX, y: H * 0.34 + 62, size: 13, font: italic, color: rgb(0.88, 0.93, 0.9) });
  page.drawText(ok(`${t.prepared}  -  ${new Date().toISOString().slice(0, 10)}`), { x: MX, y: 50, size: 9, font: regular, color: rgb(0.75, 0.82, 0.78) });
  newPage();
  const tocPage = page;

  if (d.executiveSummary?.length) {
    newPage(t.summary);
    bullets(d.executiveSummary);
  }
  if (d.positioning) {
    newPage(t.positioning);
    para(d.positioning);
  }
  if (d.audience) {
    newPage(t.audience);
    para(d.audience);
  }
  if (d.competitors?.length) {
    newPage(t.competitors);
    for (const c of d.competitors) {
      const rows: [string, string | undefined][] = [[t.offer, c.offer], [t.pricing, c.pricing], [t.pos, c.positioning], [t.strengths, c.strengths], [t.weaknesses, c.weaknesses], [t.notes, c.notes]];
      const lines = rows.flatMap(([k, v]) => (v ? wrap(`${k}: ${v}`, regular, 9.5, CW - 24) : []));
      const h = 34 + lines.length * 12 + 10;
      ensure(h + 8);
      page.drawRectangle({ x: MX, y: y - h, width: CW, height: h, color: rgb(0.97, 0.98, 0.97), borderColor: LINE, borderWidth: 0.5 });
      page.drawRectangle({ x: MX, y: y - h, width: 4, height: h, color: ACCENT });
      page.drawText(ok(c.name).slice(0, 60), { x: MX + 14, y: y - 18, size: 12, font: bold, color: GREEN });
      const meta = [c.type, c.url].filter(Boolean).join("  -  ");
      if (meta) page.drawText(ok(meta).slice(0, 90), { x: MX + 14, y: y - 30, size: 8.5, font: regular, color: SOFT });
      lines.forEach((ln, i) => page.drawText(ln, { x: MX + 14, y: y - 46 - i * 12, size: 9.5, font: regular, color: INK }));
      y -= h + 8;
    }
  }
  if (d.design?.intro || d.design?.patterns?.length) {
    newPage(t.design);
    para(d.design?.intro);
    bullets(d.design?.patterns);
  }
  // A table: header row, then the rows (cells wrap), with its columns sized by weight.
  const table = (headers: string[], rows: string[][], weights: number[]) => {
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * CW);
    const draw = (cells: string[], head: boolean) => {
      const wrapped = cells.map((c, i) => wrap(c || "", head ? bold : regular, 8.5, widths[i] - 8));
      const h = Math.max(...wrapped.map((l) => l.length)) * 11 + 8;
      ensure(h + 2);
      if (head) page.drawRectangle({ x: MX, y: y - h + 4, width: CW, height: h, color: rgb(0.93, 0.96, 0.94) });
      let x = MX;
      wrapped.forEach((lines, i) => {
        lines.forEach((ln, n) => page.drawText(ln, { x: x + 4, y: y - 8 - n * 11, size: 8.5, font: head ? bold : regular, color: head ? GREEN : INK }));
        x += widths[i];
      });
      page.drawLine({ start: { x: MX, y: y - h + 4 }, end: { x: W - MX, y: y - h + 4 }, thickness: 0.4, color: LINE });
      y -= h;
    };
    draw(headers, true);
    for (const r of rows) draw(r, false);
    y -= 10;
  };
  if (d.keywords?.length) {
    newPage(t.keywords);
    table([t.keyword, t.intent, t.volume, t.difficulty, t.priority], d.keywords.map((k) => [k.keyword, k.intent ?? "", k.volume ?? "", k.difficulty ?? "", k.priority ?? ""]), [3, 3, 1.5, 1.5, 1.5]);
  }
  if (d.competitorBlogs?.length) {
    newPage(t.blogs);
    table([t.competitor, "URL", t.topics, t.frequency, t.formats, t.gapsCol], d.competitorBlogs.map((b) => [b.competitor, b.blogUrl ?? "", b.topics ?? "", b.frequency ?? "", b.formats ?? "", b.gaps ?? ""]), [2, 2.4, 3, 1.5, 1.6, 3]);
  }
  if (d.contentPlan?.length) {
    newPage(t.plan);
    table(["#", t.title, t.keyword, t.format, t.language, t.priority], d.contentPlan.map((c, i) => [String(i + 1), c.title, c.keyword ?? "", c.format ?? "", c.language ?? "", c.priority ?? ""]), [0.5, 5, 2.5, 1.6, 1.4, 1.4]);
  }
  if (input.shots.length > 0) {
    newPage(t.screenshots);
    const cw = (CW - 12) / 2;
    for (let i = 0; i < input.shots.length; i += 2) {
      const boxH = cw * 0.7;
      ensure(boxH + 26);
      for (const [k, s] of input.shots.slice(i, i + 2).entries()) {
        try {
          const img = s.kind === "png" ? await pdf.embedPng(s.bytes) : await pdf.embedJpg(s.bytes);
          const sc = Math.min((cw - 8) / img.width, (boxH - 8) / img.height);
          const x = MX + k * (cw + 12);
          page.drawRectangle({ x, y: y - boxH, width: cw, height: boxH, color: rgb(0.97, 0.98, 0.97), borderColor: LINE, borderWidth: 0.5 });
          page.drawImage(img, { x: x + (cw - img.width * sc) / 2, y: y - boxH / 2 - (img.height * sc) / 2, width: img.width * sc, height: img.height * sc });
          page.drawText(ok(s.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")).slice(0, 48), { x, y: y - boxH - 11, size: 8, font: regular, color: SOFT });
        } catch {
          /* a screenshot that can't be drawn is skipped */
        }
      }
      y -= boxH + 24;
    }
  }
  if (d.gaps?.length) {
    newPage(t.gaps);
    bullets(d.gaps);
  }
  if (d.recommendations?.length) {
    newPage(t.recommendations);
    for (const r of d.recommendations) {
      sub(r.title);
      para(r.description);
    }
  }
  if (d.risks?.length) {
    newPage(t.risks);
    bullets(d.risks);
  }
  if (d.nextSteps?.length) {
    ensure(120);
    sub(t.next);
    bullets(d.nextSteps);
  }

  tocPage.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: GREEN });
  tocPage.drawRectangle({ x: 0, y: H - 82, width: W, height: 4, color: ACCENT });
  tocPage.drawText(ok(t.contents), { x: MX, y: H - 52, size: 22, font: bold, color: rgb(1, 1, 1) });
  let ty = H - 130;
  for (const e of toc) {
    tocPage.drawText(ok(e.title), { x: MX, y: ty, size: 13, font: regular, color: INK });
    const num = String(e.page);
    tocPage.drawText(num, { x: W - MX - regular.widthOfTextAtSize(num, 13), y: ty, size: 13, font: bold, color: GREEN });
    tocPage.drawLine({ start: { x: MX, y: ty - 8 }, end: { x: W - MX, y: ty - 8 }, thickness: 0.4, color: LINE });
    ty -= 30;
  }
  return pdf.save();
}

export async function finishResearchReport(db: PrismaClient, projectId: string, parts: { en: Partial<ResearchDoc>[]; fr: Partial<ResearchDoc>[] }): Promise<{ error?: string; fileNames?: string[] }> {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { name: true, contact: { select: { firstName: true, lastName: true, company: true } } } });
  if (!p) return { error: "Project not found." };
  const clientName = p.contact.company || [p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") || "Client";
  const shotRows = await db.attachedFile.findMany({ where: { projectId, kind: "RESEARCH_SHOT" }, orderBy: { createdAt: "asc" }, take: 24, select: { name: true, mimeType: true, data: true } });
  const shots = shotRows.map((s) => ({ name: s.name, bytes: new Uint8Array(s.data as unknown as Uint8Array), kind: (s.mimeType === "image/png" ? "png" : "jpg") as "png" | "jpg" }));
  const base = `${clientName}-${p.name}`.replace(/[^\w.-]+/g, "-");
  const made: { lang: "en" | "fr"; name: string; bytes: Uint8Array }[] = [];
  for (const lang of ["en", "fr"] as const) {
    const doc = normaliseResearch(Object.assign({}, ...parts[lang]));
    made.push({ lang, name: `Research-report-${base}-${lang === "en" ? "EN" : "FR"}.pdf`, bytes: await renderResearchPdf({ doc, lang, clientName, projectName: p.name, shots }) });
  }
  await db.attachedFile.deleteMany({ where: { projectId, kind: "RESEARCH_PDF" } });
  for (const m of made) {
    await db.attachedFile.create({ data: { projectId, kind: "RESEARCH_PDF", name: m.name, mimeType: "application/pdf", size: m.bytes.length, data: m.bytes as never, uploadedByName: "AMO CRM", note: `${m.lang === "en" ? "English" : "French"} research report, merged from the AI research reports` } });
  }
  // The final report is the "Produce report" task. (The keyword research, the competitor-blog review and the
  // content plan are ticked when a dropped report contains them; the final review is the Approve button.)
  await tickResearchTasks(db, projectId, [{ match: /^produce (the )?report|^produce competitor report/i, ok: true, label: "Produce report", why: "" }]);
  return { fileNames: made.map((m) => m.name) };
}
