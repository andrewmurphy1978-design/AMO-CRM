import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PrismaClient } from "@/lib/prisma";
import { BRAND_FONTS } from "@/lib/brand";
import { onTaskDone } from "@/lib/task-schedule";
import { syncProjectLifecycle } from "@/lib/project-progress";

// The AI's brand report (a Markdown file) dropped on the Brand card: what it holds is checked, the Brand
// phase's Collect / Create / Choose tasks it covers are ticked, and a PDF brand guide is made from it.

export interface BrandAnalysis {
  colours: string[];
  fonts: string[];
  logos: boolean;
  icons: boolean;
  graphics: boolean;
  voice: boolean;
}

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

export function analyseBrandReport(md: string): BrandAnalysis {
  const text = md.toLowerCase();
  const colours = [...new Set((md.match(HEX) ?? []).map((h) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase()))];

  // Fonts: the items under a "Fonts / Typography" heading, plus any well-known font named anywhere.
  const fonts = new Set<string>();
  let inFonts = false;
  for (const line of md.split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      inFonts = /font|typograph|police|typo/i.test(heading[1]);
      continue;
    }
    if (inFonts) {
      const item = /^\s*[-*]\s+\**([^*:|—–\n]+?)\**\s*(?:[:|—–-]|$)/.exec(line);
      if (item && item[1].trim().length > 1 && item[1].trim().length < 40) fonts.add(item[1].trim());
    }
  }
  for (const f of BRAND_FONTS) if (new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(md)) fonts.add(f);

  return {
    colours,
    fonts: [...fonts].slice(0, 12),
    logos: /logo/.test(text),
    icons: /\bicon|icône|icone/.test(text),
    graphics: /graphic|pattern|illustration|graphique|motif/.test(text),
    voice: /\bvoice\b|\btone\b|\bvoix\b|\bton\b/.test(text),
  };
}

// The report's content as Brand card items: colours (name + #code), fonts (name + use), voice, and the
// logos / icons / graphics described (label and note; the files themselves are added by hand).
export interface BrandCardItem {
  category: string;
  label: string;
  value: string;
  note: string;
}

const strip = (s: string) =>
  s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/^\s*[-+>]\s*/, "")
    .trim();

export function extractBrandItems(md: string): BrandCardItem[] {
  const items: BrandCardItem[] = [];
  let section: "colours" | "fonts" | "voice" | "logos" | "icons" | "graphics" | null = null;
  const add = (it: BrandCardItem) => {
    const label = it.label.trim().slice(0, 80);
    if (!label && !it.value) return;
    if (items.some((x) => x.category === it.category && x.label.toLowerCase() === label.toLowerCase() && x.value.toLowerCase() === it.value.toLowerCase())) return;
    items.push({ ...it, label: label || it.value.slice(0, 60), value: it.value.slice(0, 1500), note: it.note.slice(0, 600) });
  };
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      const t = h[1].toLowerCase();
      section = /colou?r|couleur|palette/.test(t) ? "colours" : /font|typograph|police|typo/.test(t) ? "fonts" : /voice|tone|voix|\bton\b/.test(t) ? "voice" : /logo/.test(t) ? "logos" : /icon|icône/.test(t) ? "icons" : /graphic|pattern|illustration|graphique|motif/.test(t) ? "graphics" : null;
      continue;
    }
    if (/^\|[\s:|-]+\|$/.test(line)) continue;
    const text = strip(line.startsWith("|") ? line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).join(" - ") : line);
    if (!text) continue;
    const hex = text.match(HEX);
    if (hex && (section === "colours" || section === null || /colou?r|couleur|primary|secondary|accent|primaire|secondaire/i.test(text))) {
      for (const code of hex.slice(0, 1)) {
        const full = code.length === 4 ? `#${code[1]}${code[1]}${code[2]}${code[2]}${code[3]}${code[3]}` : code;
        const label = text.replace(HEX, "").replace(/[()[\]:|—–-]+\s*$/g, "").replace(/^[\s:|—–-]+|[\s:|—–-]+$/g, "").replace(/\s{2,}/g, " ");
        add({ category: "colours", label: label || "Colour", value: full.toUpperCase(), note: "" });
      }
      continue;
    }
    if (!section || section === "colours") continue; // a colour needs its #code
    const kv = /^([^:—–]{1,50}?)\s*[:—–]\s+(.+)$/.exec(text);
    if (section === "fonts") {
      const name = (kv ? kv[1] : text).trim();
      if (name.length > 1 && name.length < 50) add({ category: "fonts", label: name, value: kv ? kv[2].trim().slice(0, 120) : "", note: "" });
    } else if (section === "voice") {
      add(kv ? { category: "voice", label: kv[1].trim(), value: kv[2].trim(), note: "" } : { category: "voice", label: "Voice", value: text, note: "" });
    } else {
      add({ category: section, label: (kv ? kv[1] : text).trim().slice(0, 60), value: "", note: kv ? kv[2].trim() : text });
    }
  }
  return items;
}

// Which Brand-phase tasks the report covers (null: nothing to check it against).
const CHECKS: { match: RegExp; label: string; ok: (a: BrandAnalysis) => boolean; why: string }[] = [
  { match: /^collect the client's existing brand assets/i, label: "Collect the existing brand assets", ok: (a) => a.colours.length > 0 || a.fonts.length > 0 || a.logos, why: "the report lists no colours, fonts or logos" },
  { match: /^create the logo/i, label: "Create the logo", ok: (a) => a.logos, why: "the report doesn't describe the logo" },
  { match: /^choose the colou?r palette/i, label: "Choose the colour palette", ok: (a) => a.colours.length >= 2, why: "the report has fewer than 2 colour codes (#RRGGBB)" },
  { match: /^choose the fonts/i, label: "Choose the fonts", ok: (a) => a.fonts.length > 0, why: "the report names no fonts" },
  { match: /^create the icon set/i, label: "Create the icon set", ok: (a) => a.icons, why: "the report doesn't describe icons" },
  { match: /^create the graphics/i, label: "Create the graphics and patterns", ok: (a) => a.graphics, why: "the report doesn't describe graphics or patterns" },
];

const BRAND_PHASE = /(^|—\s*)brand$/i;

// ---- the PDF -----------------------------------------------------------------------

const GREEN = rgb(0.06, 0.16, 0.11);
const GOLD = rgb(0.85, 0.65, 0.13);
const INK = rgb(0.1, 0.1, 0.1);

function winAnsi(t: string): string {
  let out = "";
  for (const ch of t.replace(/→/g, "->").replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[•▪◦]/g, "-").replace(/[\r\t]/g, " ")) {
    const code = ch.codePointAt(0) ?? 0;
    out += ch === "\n" || (code >= 32 && code <= 255) ? ch : "?";
  }
  return out;
}

const plain = (s: string) =>
  s
    .replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, (_, a: string, b: string) => (a ? `${a} (${b})` : b))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");

export async function buildBrandReportPdf(input: { clientName: string; markdown: string; analysis: BrandAnalysis }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595;
  const H = 842;
  const MX = 50;
  const CW = W - 2 * MX;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - 50;

  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 30, width: W, height: 30, color: GREEN });
    page.drawText(winAnsi(`${input.clientName} - Brand guide`), { x: MX, y: H - 20, size: 9, font: bold, color: rgb(1, 1, 1) });
    y = H - 60;
  };
  const ensure = (h: number) => {
    if (y - h < 50) newPage();
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const lines: string[] = [];
    for (const para of winAnsi(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= width) line = test;
        else {
          if (line) lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const para = (text: string, o: { font?: PDFFont; size?: number; indent?: number; color?: ReturnType<typeof rgb>; after?: number } = {}) => {
    const font = o.font ?? regular;
    const size = o.size ?? 10;
    for (const ln of wrap(text, font, size, CW - (o.indent ?? 0))) {
      ensure(size + 4);
      page.drawText(ln, { x: MX + (o.indent ?? 0), y, size, font, color: o.color ?? INK });
      y -= size + 4;
    }
    y -= o.after ?? 3;
  };

  // cover
  page.drawRectangle({ x: 0, y: H - 200, width: W, height: 200, color: GREEN });
  page.drawRectangle({ x: 0, y: H - 204, width: W, height: 4, color: GOLD });
  page.drawText("Brand guide", { x: MX, y: H - 110, size: 34, font: bold, color: rgb(1, 1, 1) });
  page.drawText(winAnsi(input.clientName), { x: MX, y: H - 145, size: 16, font: regular, color: rgb(0.85, 0.93, 0.88) });
  page.drawText(new Date().toISOString().slice(0, 10), { x: MX, y: H - 170, size: 10, font: regular, color: rgb(0.7, 0.8, 0.75) });
  y = H - 250;

  const { colours, fonts } = input.analysis;
  if (colours.length > 0) {
    para("Colour palette", { font: bold, size: 14, color: GREEN, after: 6 });
    const cell = 80;
    const perRow = Math.floor(CW / (cell + 10));
    for (let i = 0; i < colours.length; i += perRow) {
      ensure(70);
      colours.slice(i, i + perRow).forEach((hex, k) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const x = MX + k * (cell + 10);
        page.drawRectangle({ x, y: y - 44, width: cell, height: 44, color: rgb(r, g, b), borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
        page.drawText(hex, { x, y: y - 58, size: 9, font: regular, color: INK });
      });
      y -= 74;
    }
  }
  if (fonts.length > 0) {
    para("Fonts", { font: bold, size: 14, color: GREEN, after: 4 });
    para(fonts.join("  -  "), { size: 11, after: 10 });
  }

  // the report itself
  newPage();
  for (const raw of input.markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      y -= 5;
      continue;
    }
    if (/^---+$|^\*\*\*+$/.test(line.trim())) {
      ensure(10);
      page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
      y -= 10;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      ensure(30);
      y -= level === 1 ? 8 : 4;
      para(plain(h[2]), { font: bold, size: level === 1 ? 17 : level === 2 ? 14 : 11.5, color: level <= 2 ? GREEN : INK, after: 4 });
      continue;
    }
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      para(`-  ${plain(bullet[2])}`, { indent: 10 + Math.min(bullet[1].length, 8) * 3, after: 1 });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // the table's divider row
      para(plain(line.replace(/^\s*\||\|\s*$/g, "").split("|").map((c) => c.trim()).join("   |   ")), { size: 9, after: 1 });
      continue;
    }
    para(plain(line));
  }
  return doc.save();
}

// ---- the whole process -------------------------------------------------------------

export interface BrandReportResult {
  added: number;
  verified: string[];
  missing: string[];
  pdf: boolean;
  projects: number;
}

export async function processBrandReport(db: PrismaClient, contactId: string, markdown: string): Promise<BrandReportResult> {
  const analysis = analyseBrandReport(markdown);
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { firstName: true, lastName: true, company: true } });
  const clientName = contact?.company || [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || "Client";

  // Everything the report describes goes on the Brand card (what is already there is kept).
  let added = 0;
  const found = extractBrandItems(markdown);
  if (found.length > 0) {
    const existing = await db.contactBrandItem.findMany({ where: { contactId }, select: { category: true, label: true, value: true } });
    const known = new Set(existing.map((e) => `${e.category}|${e.label.toLowerCase()}|${(e.value ?? "").startsWith("data:") ? "" : (e.value ?? "").toLowerCase()}`));
    const order = new Map<string, number>();
    for (const e of existing) order.set(e.category, (order.get(e.category) ?? 0) + 1);
    const fresh = found.filter((i) => !known.has(`${i.category}|${i.label.toLowerCase()}|${i.value.toLowerCase()}`));
    if (fresh.length > 0) {
      await db.contactBrandItem.createMany({
        data: fresh.map((i) => {
          const n = order.get(i.category) ?? 0;
          order.set(i.category, n + 1);
          return { contactId, category: i.category, label: i.label, value: i.value || null, note: i.note || null, order: n };
        }),
      });
      added = fresh.length;
    }
  }

  // The PDF guide (replaces the previous one).
  let pdf = false;
  try {
    const bytes = await buildBrandReportPdf({ clientName, markdown, analysis });
    await db.attachedFile.deleteMany({ where: { contactId, kind: "BRAND_PDF" } });
    await db.attachedFile.create({
      data: { contactId, kind: "BRAND_PDF", name: `Brand-guide-${clientName.replace(/[^\w.-]+/g, "-")}.pdf`, mimeType: "application/pdf", size: bytes.length, data: bytes as never, uploadedByName: "AMO CRM", note: "Generated from the AI brand report" },
    });
    pdf = true;
  } catch (err) {
    console.error("brand guide PDF not generated", err);
  }

  // Tick the Brand-phase tasks the report covers (and the PDF task once the PDF exists).
  const verified: string[] = [];
  const missing: string[] = [];
  const projects = await db.project.findMany({
    where: { contactId, createBrand: true },
    select: { id: true, phases: { where: {}, select: { id: true, name: true, tasks: { select: { id: true, title: true, status: true } } } } },
  });
  let touched = 0;
  for (const p of projects) {
    let changed = false;
    for (const phase of p.phases.filter((ph) => BRAND_PHASE.test(ph.name.trim()))) {
      for (const task of phase.tasks) {
        const title = task.title.trim();
        let ok: boolean | null = null;
        let label = title;
        let why = "";
        const check = CHECKS.find((c) => c.match.test(title));
        if (check) {
          ok = check.ok(analysis);
          label = check.label;
          why = check.why;
        } else if (/^create the brand guide/i.test(title)) {
          ok = pdf;
          label = "Create the brand guide (PDF)";
          why = "the PDF could not be generated";
        }
        if (ok === null) continue;
        if (task.status === "DONE") continue;
        if (ok) {
          await db.task.update({ where: { id: task.id }, data: { status: "DONE", completedAt: new Date() } });
          await onTaskDone(db, task.id);
          if (!verified.includes(label)) verified.push(label);
          changed = true;
        } else {
          const m = `${label}: ${why}`;
          if (!missing.includes(m)) missing.push(m);
        }
      }
    }
    if (changed) {
      await syncProjectLifecycle(db, p.id);
      touched++;
    }
  }
  return { added, verified, missing, pdf, projects: touched };
}
