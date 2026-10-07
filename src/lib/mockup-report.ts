import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { mockupSections } from "@/lib/mockup-files";
import { ok } from "@/lib/research-report";

// The final mock-up report: the AI report(s) merged into one designed PDF, in English and in French. Written in
// small parallel parts (see the brand guide): part 0 = overview, tokens, notes and checklist; then one part per mock-up.

export interface MockupScreen {
  name: string;
  goal?: string;
  sections?: string[];
  copy?: string;
  notes?: string;
}
export interface MockupBlock {
  type: string;
  intro?: string;
  screens?: MockupScreen[];
  flows?: string[];
}
export interface MockupDoc {
  summary?: string[];
  colors?: { name: string; value: string; usage?: string }[];
  fonts?: string[];
  tokensNote?: string;
  notes?: string[];
  checklist?: { mockup: string; items: string[] }[];
  mockup?: MockupBlock;
}

const TYPE_LABEL: Record<string, string> = { website: "Website", funnel: "Funnel", blog: "Blog", app: "App" };
const FR_TYPE: Record<string, string> = { website: "Site web", funnel: "Entonnoir", blog: "Blogue", app: "Application" };

export interface MockupSources {
  apiKey: string;
  clientName: string;
  projectName: string;
  reports: string[];
  types: string[];
}

export async function loadMockupSources(db: PrismaClient, projectId: string): Promise<MockupSources | { error: string }> {
  const files = await db.attachedFile.findMany({
    where: { projectId, kind: "MOCKUP_REPORT", OR: [{ name: { endsWith: ".md", mode: "insensitive" } }, { name: { endsWith: ".markdown", mode: "insensitive" } }, { name: { endsWith: ".txt", mode: "insensitive" } }] },
    orderBy: { createdAt: "asc" },
    select: { data: true },
  });
  const reports = files.map((f) => new TextDecoder("utf-8").decode(f.data as unknown as Uint8Array));
  if (reports.length === 0) return { error: "Drop the AI mock-up report (a Markdown .md file) on the Mock-ups card first." };
  const types = [...new Set(reports.flatMap((r) => mockupSections(r)))];
  if (types.length === 0) return { error: "The report has no “# Website mock-up” / “# Funnel mock-up” / “# Blog mock-up” / “# App mock-up” section." };
  const setting = await db.integrationSetting.findUnique({ where: { provider: "anthropic" } });
  if (!setting?.apiKeyEncrypted) return { error: "No Anthropic API key configured: add one in Settings first." };
  const p = await db.project.findUnique({ where: { id: projectId }, select: { name: true, contact: { select: { firstName: true, lastName: true, company: true } } } });
  const clientName = p?.contact.company || [p?.contact.firstName, p?.contact.lastName].filter(Boolean).join(" ") || "Client";
  return { apiKey: await decryptSecret(setting.apiKeyEncrypted), clientName, projectName: p?.name ?? "", reports, types };
}

const SCREEN = '{"name": "", "goal": "", "sections": ["in order"], "copy": "key headline and call-to-action copy", "notes": "interaction / responsive notes"}';

export async function writeMockupPart(input: MockupSources & { lang: "en" | "fr"; part: number }): Promise<Partial<MockupDoc> | { error: string }> {
  const type = input.part === 0 ? null : input.types[input.part - 1];
  if (input.part !== 0 && !type) return { error: "Unknown part." };
  const language = input.lang === "fr" ? "Canadian French (français du Québec, professional, with proper accents)" : "English";
  const shape =
    input.part === 0
      ? '{"summary": ["4 short bullets: what is being designed and the key design decisions"], "colors": [{"name": "", "value": "#hex", "usage": ""}], "fonts": ["Font: use"], "tokensNote": "spacing, radius, other tokens in one short paragraph", "notes": ["responsive, interaction and accessibility notes"], "checklist": [{"mockup": "Website", "items": ["approval items the client can tick"]}]}'
      : `{"mockup": {"type": "${TYPE_LABEL[type!]}", "intro": "2 sentences", "screens": [${SCREEN}], "flows": ["key user flows, if any"]}}`;
  const what = input.part === 0 ? "the OVERVIEW: summary, shared design tokens, notes and the approval checklist (one entry per mock-up: " + input.types.map((t) => TYPE_LABEL[t]).join(", ") + ")" : `the ${TYPE_LABEL[type!]} MOCK-UP section only`;
  const reports = input.reports.map((r, i) => `=== MOCK-UP REPORT ${i + 1} ===\n${r.slice(0, 24_000)}`).join("\n\n");
  const prompt = `You are writing part of the final MOCK-UP REPORT of a client project, to be laid out as a designed PDF the client approves.

Client: ${input.clientName}. Project: ${input.projectName}.

Write ${what}, based on the report(s) below. If several reports exist, merge them into one coherent version and keep every useful decision. Never mention the reports or the AIs, and do not invent content that is not in the sources. Write all text in ${language}. Keep each text short and concrete: at most 8 screens or pages per mock-up, each field under 30 words, at most 6 sections per screen and 5 flows.

Respond with ONLY one JSON object (no markdown fences) in exactly this shape; use [] or "" when the sources say nothing:
${shape}

${reports}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 6_500, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(85_000),
    });
    if (!res.ok) return { error: `The AI request failed (HTTP ${res.status}: ${(await res.text()).slice(0, 140)}).` };
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const s = text.indexOf("{");
    if (s < 0) return { error: "The AI didn't return usable content." };
    if (data.stop_reason === "max_tokens") {
      // Cut off: keep everything that was complete (the screens written so far) instead of failing.
      const fixed = closeTruncatedJson(text.slice(s));
      return fixed ? (fixed as Partial<MockupDoc>) : { error: "The AI's reply was cut off." };
    }
    const e = text.lastIndexOf("}");
    if (e <= s) return { error: "The AI didn't return usable content." };
    return JSON.parse(text.slice(s, e + 1)) as Partial<MockupDoc>;
  } catch (err) {
    return { error: `The AI request failed (${err instanceof Error ? err.message : "error"}).` };
  }
}

// A JSON object that was cut off mid-way: cut back to the last complete value and close the open brackets.
function closeTruncatedJson(text: string): unknown | null {
  for (let cut = text.length; cut > 1; cut--) {
    const ch = text[cut - 1];
    if (ch !== "}" && ch !== "]" && ch !== '"' && !/[0-9el]/.test(ch)) continue;
    const head = text.slice(0, cut);
    const stack: string[] = [];
    let inStr = false;
    for (let i = 0; i < head.length; i++) {
      const c = head[i];
      if (inStr) {
        if (c === "\\") i++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") stack.push("}");
      else if (c === "[") stack.push("]");
      else if (c === "}" || c === "]") stack.pop();
    }
    if (inStr) continue;
    try {
      return JSON.parse(head + stack.reverse().join(""));
    } catch {
      /* keep cutting back */
    }
  }
  return null;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);

function normalise(parts: Partial<MockupDoc>[]): { doc: MockupDoc; blocks: MockupBlock[] } {
  const base = Object.assign({}, ...parts.map((p) => ({ ...p, mockup: undefined }))) as Partial<MockupDoc>;
  const doc: MockupDoc = {
    summary: strs(base.summary),
    colors: (Array.isArray(base.colors) ? base.colors : []).filter((c) => c && typeof c.name === "string").map((c) => ({ name: c.name, value: str(c.value) ?? "", usage: str(c.usage) })),
    fonts: strs(base.fonts),
    tokensNote: str(base.tokensNote),
    notes: strs(base.notes),
    checklist: (Array.isArray(base.checklist) ? base.checklist : []).filter((c) => c && typeof c.mockup === "string").map((c) => ({ mockup: c.mockup, items: strs(c.items) })),
  };
  const blocks = parts
    .map((p) => p.mockup)
    .filter((m): m is MockupBlock => Boolean(m && typeof m.type === "string"))
    .map((m) => ({
      type: m.type,
      intro: str(m.intro),
      flows: strs(m.flows),
      screens: (Array.isArray(m.screens) ? m.screens : []).filter((s) => s && typeof s.name === "string" && s.name.trim()).map((s) => ({ name: s.name, goal: str(s.goal), sections: strs(s.sections), copy: str(s.copy), notes: str(s.notes) })),
    }));
  return { doc, blocks };
}

const T = {
  en: { report: "Mock-up report", contents: "Contents", summary: "Summary", tokens: "Design tokens", colors: "Colours", fonts: "Fonts", notes: "Responsive, interaction and accessibility", checklist: "Approval checklist", goal: "Goal", sections: "Sections", copy: "Copy", flows: "Key flows", images: "Images", prepared: "Prepared by Andrew Murphy Online", mockup: "mock-up" },
  fr: { report: "Rapport des maquettes", contents: "Table des matières", summary: "Sommaire", tokens: "Éléments de design", colors: "Couleurs", fonts: "Polices", notes: "Adaptabilité, interactions et accessibilité", checklist: "Liste d'approbation", goal: "Objectif", sections: "Sections", copy: "Texte", flows: "Parcours clés", images: "Images", prepared: "Préparé par Andrew Murphy Online", mockup: "maquette" },
} as const;

export interface MockupImage {
  name: string;
  type: string;
  bytes: Uint8Array;
  kind: "png" | "jpg";
}

export async function renderMockupPdf(input: { parts: Partial<MockupDoc>[]; lang: "en" | "fr"; clientName: string; projectName: string; images: MockupImage[] }): Promise<Uint8Array> {
  const t = T[input.lang];
  const { doc: d, blocks } = normalise(input.parts);
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
      page.drawText(ok(title).slice(0, 44), { x: MX, y: H - 52, size: 22, font: bold, color: rgb(1, 1, 1) });
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
  const para = (text: string | undefined, size = 10.5) => {
    if (!text) return;
    for (const p of text.split(/\n{2,}/)) {
      for (const ln of wrap(p, regular, size, CW)) {
        ensure(size + 6);
        page.drawText(ln, { x: MX, y, size, font: regular, color: INK });
        y -= size + 5;
      }
      y -= 6;
    }
  };
  const bullets = (items: string[] | undefined, mark = "-") => {
    for (const it of items ?? []) {
      const lines = wrap(it, regular, 10.5, CW - 16);
      ensure(lines.length * 15 + 2);
      page.drawText(mark, { x: MX + 2, y, size: 10.5, font: bold, color: ACCENT });
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
    page.drawText(ok(text).slice(0, 70), { x: MX, y, size: 13, font: bold, color: GREEN });
    y -= 22;
  };

  // cover
  page = pdf.addPage([W, H]);
  n++;
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: GREEN });
  page.drawRectangle({ x: 0, y: H * 0.34, width: W, height: 5, color: ACCENT });
  wrap(t.report, bold, 38, CW).forEach((ln, i) => page.drawText(ln, { x: MX, y: H * 0.34 + 150 - i * 44, size: 38, font: bold, color: rgb(1, 1, 1) }));
  wrap(input.clientName, bold, 22, CW).forEach((ln, i) => page.drawText(ln, { x: MX, y: H * 0.34 + 90 - i * 28, size: 22, font: bold, color: ACCENT }));
  page.drawText(ok(input.projectName).slice(0, 80), { x: MX, y: H * 0.34 + 50, size: 13, font: italic, color: rgb(0.88, 0.93, 0.9) });
  page.drawText(ok(`${t.prepared}  -  ${new Date().toISOString().slice(0, 10)}`), { x: MX, y: 50, size: 9, font: regular, color: rgb(0.75, 0.82, 0.78) });
  newPage();
  const tocPage = page;

  if (d.summary?.length) {
    newPage(t.summary);
    bullets(d.summary);
  }

  const label = (type: string) => (input.lang === "fr" ? (FR_TYPE[type.toLowerCase()] ?? type) : type);
  for (const b of blocks) {
    newPage(`${label(b.type)} - ${t.mockup}`);
    para(b.intro);
    for (const s of b.screens ?? []) {
      sub(s.name);
      if (s.goal) para(`${t.goal}: ${s.goal}`, 10);
      if (s.sections?.length) {
        para(`${t.sections}:`, 10);
        bullets(s.sections);
      }
      if (s.copy) para(`${t.copy}: ${s.copy}`, 10);
      if (s.notes) para(s.notes, 9.5);
      y -= 4;
    }
    if (b.flows?.length) {
      sub(t.flows);
      bullets(b.flows);
    }
    const imgs = input.images.filter((i) => i.type === b.type.toLowerCase()).slice(0, 8);
    if (imgs.length > 0) {
      sub(t.images);
      const cw = (CW - 12) / 2;
      for (let i = 0; i < imgs.length; i += 2) {
        const boxH = cw * 0.75;
        ensure(boxH + 26);
        for (const [k, s] of imgs.slice(i, i + 2).entries()) {
          try {
            const img = s.kind === "png" ? await pdf.embedPng(s.bytes) : await pdf.embedJpg(s.bytes);
            const sc = Math.min((cw - 8) / img.width, (boxH - 8) / img.height);
            const x = MX + k * (cw + 12);
            page.drawRectangle({ x, y: y - boxH, width: cw, height: boxH, color: rgb(0.97, 0.98, 0.97), borderColor: LINE, borderWidth: 0.5 });
            page.drawImage(img, { x: x + (cw - img.width * sc) / 2, y: y - boxH / 2 - (img.height * sc) / 2, width: img.width * sc, height: img.height * sc });
            page.drawText(ok(s.name.replace(/^.*\//, "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")).slice(0, 48), { x, y: y - boxH - 11, size: 8, font: regular, color: SOFT });
          } catch {
            /* an image that can't be drawn is skipped */
          }
        }
        y -= boxH + 24;
      }
    }
  }

  if (d.colors?.length || d.fonts?.length || d.tokensNote) {
    newPage(t.tokens);
    if (d.colors?.length) {
      sub(t.colors);
      for (const c of d.colors) {
        ensure(26);
        const m = /^#?([0-9a-f]{6})$/i.exec(c.value.trim());
        if (m) {
          const v = parseInt(m[1], 16);
          page.drawRectangle({ x: MX, y: y - 14, width: 28, height: 18, color: rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255), borderColor: LINE, borderWidth: 0.5 });
        }
        page.drawText(ok(`${c.name}  ${c.value}${c.usage ? `  -  ${c.usage}` : ""}`).slice(0, 90), { x: MX + 38, y: y - 8, size: 10, font: regular, color: INK });
        y -= 26;
      }
      y -= 6;
    }
    if (d.fonts?.length) {
      sub(t.fonts);
      bullets(d.fonts);
    }
    para(d.tokensNote);
  }
  if (d.notes?.length) {
    newPage(t.notes);
    bullets(d.notes);
  }
  if (d.checklist?.length) {
    newPage(t.checklist);
    for (const c of d.checklist) {
      sub(c.mockup);
      for (const it of c.items) {
        const lines = wrap(it, regular, 10.5, CW - 24);
        ensure(lines.length * 15 + 4);
        page.drawRectangle({ x: MX + 2, y: y - 9, width: 10, height: 10, borderColor: GREEN, borderWidth: 1 });
        for (const ln of lines) {
          page.drawText(ln, { x: MX + 22, y, size: 10.5, font: regular, color: INK });
          y -= 15;
        }
        y -= 4;
      }
      y -= 8;
    }
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

export async function finishMockupReport(db: PrismaClient, projectId: string, parts: { en: Partial<MockupDoc>[]; fr: Partial<MockupDoc>[] }): Promise<{ error?: string; fileNames?: string[] }> {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { name: true, contact: { select: { firstName: true, lastName: true, company: true } } } });
  if (!p) return { error: "Project not found." };
  const clientName = p.contact.company || [p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") || "Client";
  const rows = await db.attachedFile.findMany({ where: { projectId, kind: "MOCKUP_SHOT" }, orderBy: { createdAt: "asc" }, take: 40, select: { name: true, mimeType: true, data: true } });
  const images: MockupImage[] = rows.map((s) => ({ name: s.name, type: s.name.includes("/") ? s.name.split("/")[0].toLowerCase() : "", bytes: new Uint8Array(s.data as unknown as Uint8Array), kind: s.mimeType === "image/png" ? "png" : "jpg" }));
  const base = `${clientName}-${p.name}`.replace(/[^\w.-]+/g, "-");
  const made: { lang: "en" | "fr"; name: string; bytes: Uint8Array }[] = [];
  for (const lang of ["en", "fr"] as const) {
    made.push({ lang, name: `Mockup-report-${base}-${lang === "en" ? "EN" : "FR"}.pdf`, bytes: await renderMockupPdf({ parts: parts[lang], lang, clientName, projectName: p.name, images }) });
  }
  await db.attachedFile.deleteMany({ where: { projectId, kind: "MOCKUP_PDF" } });
  for (const m of made) {
    await db.attachedFile.create({ data: { projectId, kind: "MOCKUP_PDF", name: m.name, mimeType: "application/pdf", size: m.bytes.length, data: m.bytes as never, uploadedByName: "AMO CRM", note: `${m.lang === "en" ? "English" : "French"} mock-up report, merged from the AI mock-up reports` } });
  }
  return { fileNames: made.map((m) => m.name) };
}
