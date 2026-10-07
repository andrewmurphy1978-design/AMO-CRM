import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@/lib/prisma";
import { BRAND_FONTS, MAX_BRAND_FILE_BYTES } from "@/lib/brand";
import { readZip } from "@/lib/zip-read";
import { decryptSecret } from "@/lib/crypto";
import { loadBrandRows } from "@/lib/brand-rows";
import { normaliseGuide, renderGuidePdf, type GuideAssets, type GuideDoc } from "@/lib/brand-guide";
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
  photos: boolean;
  charts: boolean;
}

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

export function analyseBrandReport(md: string): BrandAnalysis {
  const text = md.toLowerCase();
  // Colours come from the report's colour sections (code blocks and contrast tables don't count).
  const fromItems = [...new Set(extractBrandItems(md).filter((i) => i.category === "colours").map((i) => i.value))];
  const colours = fromItems.length > 0 ? fromItems : [...new Set((md.match(HEX) ?? []).map((h) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase()))];

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
    photos: /\bphoto|photograph/.test(text),
    charts: /\bchart|data.?vis|diagramme/.test(text),
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
  let fenced = false;
  const add = (it: BrandCardItem) => {
    const label = it.label.trim().slice(0, 80);
    if (!label && !it.value) return;
    if (items.some((x) => x.category === it.category && x.label.toLowerCase() === label.toLowerCase() && x.value.toLowerCase() === it.value.toLowerCase())) return;
    items.push({ ...it, label: label || it.value.slice(0, 60), value: it.value.slice(0, 1500), note: it.note.slice(0, 600) });
  };
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced; // code (SVG, CSS...) is never brand data
      continue;
    }
    if (fenced || !line || line.startsWith("<")) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      const t = h[1].toLowerCase();
      // Level-3+ headings inside a recognised section keep that section (e.g. "### Primary palette").
      const next = /colou?r|couleur|palette/.test(t) ? "colours" : /font|typograph|police|typo/.test(t) ? "fonts" : /voice|tone|voix|\bton\b/.test(t) ? "voice" : /logo/.test(t) ? "logos" : /icon|icône/.test(t) ? "icons" : /graphic|pattern|illustration|graphique|motif/.test(t) ? "graphics" : null;
      const level = h[1] ? (/^#+/.exec(line)?.[0].length ?? 2) : 2;
      section = next ?? (level >= 3 && section && !/contrast|access|wcag|usage|rule|guideline/.test(t) ? section : null);
      if (/contrast|access|wcag/.test(t)) section = null;
      continue;
    }
    if (/^\|[\s:|-]+\|$/.test(line)) continue;
    const isRow = line.startsWith("|");
    const cells = isRow ? line.replace(/^\||\|$/g, "").split("|").map((c) => strip(c)) : [];
    const text = isRow ? cells.join(" - ") : strip(line);
    if (!text) continue;

    if (section === "colours") {
      const hex = text.match(HEX);
      if (!hex) continue;
      const code = hex[0];
      const full = (code.length === 4 ? `#${code[1]}${code[1]}${code[2]}${code[2]}${code[3]}${code[3]}` : code).toUpperCase();
      let label: string;
      let note = "";
      if (isRow) {
        const named = cells.filter((c) => c && !HEX.test(c) && !/^[\d\s,.%]+$/.test(c));
        HEX.lastIndex = 0;
        const [first, second, ...rest] = named;
        label = second && second.length < 30 && first.length < 30 ? `${first} - ${second}` : first ?? "Colour";
        note = (second && label === first ? [second, ...rest] : rest).join(" - ");
      } else {
        label = text.replace(HEX, "").replace(/\(\s*\)/g, "").replace(/^[\s:|—–-]+|[\s:|—–-]+$/g, "").replace(/\s{2,}/g, " ");
      }
      HEX.lastIndex = 0;
      add({ category: "colours", label: label || "Colour", value: full, note });
      continue;
    }
    if (!section) continue;
    const kv = /^([^:—–]{1,50}?)\s*[:—–]\s+(.+)$/.exec(text);
    if (section === "fonts") {
      const name = (kv ? kv[1] : text).trim();
      if (name.length > 1 && name.length < 50 && !/^(size|scale|line|body|heading)s?\b/i.test(name) || BRAND_FONTS.includes(name)) add({ category: "fonts", label: name, value: kv ? kv[2].trim().slice(0, 120) : "", note: "" });
    } else if (section === "voice") {
      if (!/^(do|don't|dont|sample|example)/i.test(text) && line.length > 2) add(kv ? { category: "voice", label: kv[1].trim(), value: kv[2].trim(), note: "" } : { category: "voice", label: "Voice", value: text, note: "" });
    } else if (/^[-*+]\s/.test(line)) {
      add({ category: section, label: (kv ? kv[1] : text).trim().slice(0, 60), value: "", note: kv ? kv[2].trim() : text });
    }
  }
  return items;
}

// Ticks the matching tasks of the Brand phase of the client's projects (and moves the project on).
export async function tickBrandPhaseTasks(db: PrismaClient, contactId: string, match: RegExp): Promise<void> {
  const projects = await db.project.findMany({ where: { contactId, createBrand: true }, select: { id: true, phases: { select: { name: true, tasks: { select: { id: true, title: true, status: true } } } } } });
  for (const p of projects) {
    let changed = false;
    for (const phase of p.phases.filter((ph) => BRAND_PHASE.test(ph.name.trim()))) {
      for (const task of phase.tasks) {
        if (match.test(task.title.trim()) && task.status !== "DONE") {
          await db.task.update({ where: { id: task.id }, data: { status: "DONE", completedAt: new Date() } });
          await onTaskDone(db, task.id);
          changed = true;
        }
      }
    }
    if (changed) await syncProjectLifecycle(db, p.id);
  }
}

// The images of the AI's brand-assets.zip become files on the Brand card (by folder / file name).
const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
const ZIP_CATEGORIES: [RegExp, string][] = [
  [/logo/i, "logos"],
  [/icon|favicon/i, "icons"],
  [/pattern|graphic|illustration|banner/i, "graphics"],
  [/photo|portrait|headshot/i, "photos"],
  [/component|button|card|header|form/i, "components"],
  [/chart/i, "charts"],
  [/colou?r|palette|swatch|font|typograph|specimen|voice/i, "graphics"], // sheets that illustrate a section: shown with the graphics
];

export async function importBrandZip(db: PrismaClient, contactId: string, zip: Uint8Array): Promise<{ added: number; skipped: string[] }> {
  const { entries, skipped } = await readZip(zip);
  const existing = await db.contactBrandItem.findMany({ where: { contactId }, select: { category: true, label: true } });
  const known = new Set(existing.map((e) => `${e.category}|${e.label.toLowerCase()}`));
  const order = new Map<string, number>();
  for (const e of existing) order.set(e.category, (order.get(e.category) ?? 0) + 1);
  const rows: { contactId: string; category: string; label: string; value: string; order: number }[] = [];
  // PNG / JPG first: when a PNG and its SVG share a name, the PNG is the one kept (the PDF can draw it).
  entries.sort((a, b) => Number(/\.svg$/i.test(a.name)) - Number(/\.svg$/i.test(b.name)));
  for (const e of entries) {
    const ext = (e.name.split(".").pop() ?? "").toLowerCase();
    const mime = IMAGE_TYPES[ext];
    if (!mime) continue; // the Markdown report and other files are not brand images
    const category = ZIP_CATEGORIES.find(([re]) => re.test(e.name))?.[1];
    if (!category) {
      skipped.push(`${e.name} (no logos/icons/graphics... folder or name)`);
      continue;
    }
    if (e.data.length > MAX_BRAND_FILE_BYTES) {
      skipped.push(`${e.name} (over ${Math.round(MAX_BRAND_FILE_BYTES / 1000)} KB)`);
      continue;
    }
    if (rows.length >= 60) {
      skipped.push(`${e.name} (more than 60 images)`);
      continue;
    }
    const label = (e.name.split("/").pop() ?? e.name).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 80);
    if (known.has(`${category}|${label.toLowerCase()}`)) continue;
    known.add(`${category}|${label.toLowerCase()}`);
    let bin = "";
    for (let i = 0; i < e.data.length; i += 0x8000) bin += String.fromCharCode(...e.data.subarray(i, i + 0x8000));
    const n = order.get(category) ?? 0;
    order.set(category, n + 1);
    rows.push({ contactId, category, label, value: `data:${mime};base64,${btoa(bin)}`, order: n });
  }
  if (rows.length > 0) await db.contactBrandItem.createMany({ data: rows });
  return { added: rows.length, skipped };
}

// Which Brand-phase tasks the report covers (null: nothing to check it against).
const CHECKS: { match: RegExp; label: string; ok: (a: BrandAnalysis) => boolean; why: string }[] = [
  { match: /^collect the client's existing brand assets/i, label: "Collect the existing brand assets", ok: (a) => a.colours.length > 0 || a.fonts.length > 0 || a.logos, why: "the report lists no colours, fonts or logos" },
  { match: /^create the logo/i, label: "Create the logo", ok: (a) => a.logos, why: "the report doesn't describe the logo" },
  { match: /^choose the colou?r palette/i, label: "Choose the colour palette", ok: (a) => a.colours.length >= 2, why: "the report has fewer than 2 colour codes (#RRGGBB)" },
  { match: /^choose the fonts/i, label: "Choose the fonts", ok: (a) => a.fonts.length > 0, why: "the report names no fonts" },
  { match: /^create the icon set/i, label: "Create the icon set", ok: (a) => a.icons, why: "the report doesn't describe icons" },
  { match: /^define the brand voice/i, label: "Define the brand voice and tone", ok: (a) => a.voice, why: "the report doesn't describe the voice and tone" },
  { match: /^define the photo style/i, label: "Define the photo style", ok: (a) => a.photos, why: "the report doesn't describe the photo style" },
  { match: /^define the chart/i, label: "Define the chart style", ok: (a) => a.charts, why: "the report doesn't describe the chart style" },
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
  projects: number;
}

export async function processBrandReport(db: PrismaClient, contactId: string, markdown: string): Promise<BrandReportResult> {
  const analysis = analyseBrandReport(markdown);

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

  // Tick the Brand-phase tasks the report covers. (The PDF guide is made later, by the button of the
  // "Create the brand guide (PDF)" task.)
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
        if (/^add the brand to the client's brand card/i.test(title)) {
          // New elements were put on the Brand card by this report.
          ok = added > 0;
          label = "Add the brand to the client's Brand card";
          why = "the report added nothing new to the Brand card";
        } else if (check) {
          ok = check.ok(analysis);
          label = check.label;
          why = check.why;
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
  return { added, verified, missing, projects: touched };
}

// The button of the "Create the brand guide (PDF)" task. The browser drives it in small steps (the whole
// guide in one request would outlast the 100 s a web connection can stay open):
//   1. loadGuideSources: what the AI needs (checked first, so a missing report or key shows at once)
//   2. writeGuidePart x 8 (4 parts x English / French), in parallel
//   3. finishBrandGuide: Claude's parts are merged, drawn as two designed PDFs, saved, and the task ticked
export interface GuideSources {
  apiKey: string;
  clientName: string;
  industry: string | null;
  reports: string[];
  cardLines: string[];
}

export async function loadGuideSources(db: PrismaClient, contactId: string): Promise<GuideSources | { error: string }> {
  // Only the Markdown reports are read (the images zip next to them can be several MB).
  const files = await db.attachedFile.findMany({
    where: { contactId, kind: "BRAND_REPORT", OR: [{ name: { endsWith: ".md", mode: "insensitive" } }, { name: { endsWith: ".markdown", mode: "insensitive" } }, { name: { endsWith: ".txt", mode: "insensitive" } }] },
    orderBy: { createdAt: "asc" },
    select: { name: true, data: true },
  });
  const reports = files.map((f) => new TextDecoder("utf-8").decode(f.data as unknown as Uint8Array));
  if (reports.length === 0) return { error: "Drop the AI's brand report (a Markdown .md file) on the Brand card first." };
  const setting = await db.integrationSetting.findUnique({ where: { provider: "anthropic" } });
  if (!setting?.apiKeyEncrypted) return { error: "No Anthropic API key configured: add one in Settings first." };
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { firstName: true, lastName: true, company: true, industry: true } });
  const clientName = contact?.company || [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || "Client";
  // (Without the uploaded files' bytes: they would be loaded again by every request.)
  const items = await loadBrandRows(db, contactId);
  const cardLines = items.map((i) => `- card | ${i.category} | ${i.label}${i.value && !i.value.startsWith("kept:") ? ` | ${i.value}` : i.value ? " | (file)" : ""}${i.note ? ` | ${i.note}` : ""}`);
  return { apiKey: await decryptSecret(setting.apiKeyEncrypted), clientName, industry: contact?.industry ?? null, reports, cardLines };
}

export async function finishBrandGuide(db: PrismaClient, contactId: string, projectId: string | undefined, guides: { en: Partial<GuideDoc>[]; fr: Partial<GuideDoc>[] }): Promise<{ error?: string; fileNames?: string[] }> {
  const clientName = (await db.contact.findUnique({ where: { id: contactId }, select: { firstName: true, lastName: true, company: true } }).then((c) => c?.company || [c?.firstName, c?.lastName].filter(Boolean).join(" "))) || "Client";
  // The Brand card's images that can be drawn in the PDF (PNG / JPG, each under ~400 KB), by section.
  const imgRows = await db.$queryRaw<{ category: string; label: string; value: string }[]>(Prisma.sql`
    SELECT category, label, value FROM contact_brand_items
    WHERE "contactId" = ${contactId} AND (value LIKE 'data:image/png%' OR value LIKE 'data:image/jpeg%') AND length(value) < 550000
    ORDER BY category, "order"`);
  const svgs = await db.contactBrandItem.findMany({ where: { contactId, category: "logos", value: { startsWith: "data:image/svg" } }, select: { label: true } });
  const assets: GuideAssets = { logos: [], images: {}, otherLogoFiles: svgs.map((x) => x.label) };
  for (const r of imgRows) {
    const m = /^data:image\/(png|jpe?g);base64,([\s\S]*)$/i.exec(r.value);
    if (!m) continue;
    const item = { label: r.label, kind: (m[1].toLowerCase() === "png" ? "png" : "jpg") as "png" | "jpg", bytes: Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)) };
    if (r.category === "logos") {
      if (assets.logos.length < 6) assets.logos.push(item);
    } else {
      const list = (assets.images[r.category] ??= []);
      if (list.length < 9) list.push(item);
    }
  }

  const base = clientName.replace(/[^\w.-]+/g, "-");
  const made: { name: string; bytes: Uint8Array; lang: "en" | "fr" }[] = [];
  for (const lang of ["en", "fr"] as const) {
    const guide = normaliseGuide(Object.assign({}, ...guides[lang]));
    made.push({ lang, name: `Brand-guide-${base}-${lang === "en" ? "EN" : "FR"}.pdf`, bytes: await renderGuidePdf({ guide, lang, clientName, assets }) });
  }
  const reports = await db.attachedFile.count({ where: { contactId, kind: "BRAND_REPORT" } });
  await db.attachedFile.deleteMany({ where: { contactId, kind: "BRAND_PDF" } });
  for (const m of made) {
    await db.attachedFile.create({
      data: { contactId, kind: "BRAND_PDF", name: m.name, mimeType: "application/pdf", size: m.bytes.length, data: m.bytes as never, uploadedByName: "AMO CRM", note: `${m.lang === "en" ? "English" : "French"} brand guide, generated with AI from the brand reports (${reports} file${reports > 1 ? "s" : ""}) and the Brand card` },
    });
  }

  // Tick the guide task (in this project, or every project of the client that has a Brand phase).
  const projects = await db.project.findMany({ where: { contactId, createBrand: true, ...(projectId ? { id: projectId } : {}) }, select: { id: true, phases: { select: { name: true, tasks: { select: { id: true, title: true, status: true } } } } } });
  for (const p of projects) {
    let changed = false;
    for (const phase of p.phases.filter((ph) => BRAND_PHASE.test(ph.name.trim()))) {
      for (const task of phase.tasks) {
        if (/^create the brand guide/i.test(task.title.trim()) && task.status !== "DONE") {
          await db.task.update({ where: { id: task.id }, data: { status: "DONE", completedAt: new Date() } });
          await onTaskDone(db, task.id);
          changed = true;
        }
      }
    }
    if (changed) await syncProjectLifecycle(db, p.id);
  }
  return { fileNames: made.map((m) => m.name) };
}
