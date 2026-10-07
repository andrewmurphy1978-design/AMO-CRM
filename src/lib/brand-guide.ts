import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

// The client's brand guide as a designed PDF, in English and in French. The content is written by Claude
// from every AI brand report dropped on the Brand card (merged into one) plus the Brand card itself;
// the PDF is drawn here.

export interface GuideDoc {
  tagline?: string;
  introduction?: string;
  logos?: { intro?: string; versions?: { name: string; description: string }[]; clearSpace?: string; minimumSize?: string; misuse?: string[] };
  colours?: { intro?: string; palette?: { name: string; hex: string; role?: string; usage?: string }[] };
  typography?: { intro?: string; fonts?: { name: string; role?: string; usage?: string }[]; scale?: { style: string; size: string; lineHeight?: string; weight?: string }[] };
  iconography?: Rules;
  graphics?: Rules;
  photography?: Rules;
  components?: Rules;
  charts?: Rules;
  voice?: { intro?: string; attributes?: { name: string; description: string }[]; dos?: string[]; donts?: string[]; samples?: string[] };
  closing?: string;
}
interface Rules {
  intro?: string;
  rules?: string[];
}

export interface GuideAssets {
  logos: { label: string; bytes: Uint8Array; kind: "png" | "jpg" }[];
  // Images of the other sections (icons, graphics, photos, components, charts), PNG / JPG only.
  images: Record<string, { label: string; bytes: Uint8Array; kind: "png" | "jpg" }[]>;
  otherLogoFiles: string[]; // logos that can't be drawn here (SVG, WebP...): listed by name
}

const L = {
  en: {
    guide: "Brand guide", contents: "Contents", introduction: "Introduction", logos: "Logos", colours: "Colours", typography: "Typography", iconography: "Icons", graphics: "Graphics and patterns", photography: "Photography", components: "Interface components", charts: "Charts and data visualization", voice: "Voice and tone",
    clearSpace: "Clear space", minimumSize: "Minimum size", misuse: "Never", versions: "Versions", role: "Role", usage: "Usage", dos: "Do", donts: "Don't", samples: "Sample sentences", attributes: "Personality", onWhite: "on white", onBlack: "on black", scale: "Type scale", specimen: "Specimen shown in a standard typeface: install the font from Google Fonts to use it.", files: "Other logo files (vector or web formats) are in the brand package", page: "Page", prepared: "Prepared by Andrew Murphy Online",
  },
  fr: {
    guide: "Guide de marque", contents: "Table des matières", introduction: "Introduction", logos: "Logos", colours: "Couleurs", typography: "Typographie", iconography: "Icônes", graphics: "Graphiques et motifs", photography: "Photographie", components: "Composants d'interface", charts: "Diagrammes et visualisation de données", voice: "Voix et ton",
    clearSpace: "Zone de protection", minimumSize: "Taille minimale", misuse: "À éviter", versions: "Versions", role: "Rôle", usage: "Utilisation", dos: "À faire", donts: "À éviter", samples: "Exemples de phrases", attributes: "Personnalité", onWhite: "sur blanc", onBlack: "sur noir", scale: "Échelle typographique", specimen: "Spécimen affiché dans une police standard : installez la police depuis Google Fonts pour l'utiliser.", files: "Les autres fichiers de logo (formats vectoriels ou web) sont dans le dossier de marque", page: "Page", prepared: "Préparé par Andrew Murphy Online",
  },
} as const;

const EXTRA_OK = new Set("œŒšŠžŽŸ€‘’“”„•–—…™".split(""));
function ok(t: string): string {
  let out = "";
  for (const ch of (t ?? "").replace(/ | /g, " ").replace(/[\r\t]/g, " ")) {
    const code = ch.codePointAt(0) ?? 0;
    out += ch === "\n" || (code >= 32 && code <= 255) || EXTRA_OK.has(ch) ? ch : ch === "→" ? "->" : "?";
  }
  return out;
}

const hexOk = (h: string) => /^#[0-9a-f]{6}$/i.test(h);
const toRgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const;
const lum = (hex: string) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const level = (r: number) => (r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA large" : "Fail");
const col = (hex: string) => {
  const [r, g, b] = toRgb(hex);
  return rgb(r / 255, g / 255, b / 255);
};

export async function renderGuidePdf(input: { guide: GuideDoc; lang: "en" | "fr"; clientName: string; assets: GuideAssets }): Promise<Uint8Array> {
  const t = L[input.lang];
  const g = input.guide;
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const W = 595;
  const H = 842;
  const MX = 54;
  const CW = W - 2 * MX;

  const palette = (g.colours?.palette ?? []).filter((c) => hexOk(c.hex)).map((c) => ({ ...c, hex: c.hex.toUpperCase() }));
  const darkest = [...palette].sort((a, b) => lum(a.hex) - lum(b.hex))[0]?.hex;
  const primary = darkest && lum(darkest) < 0.2 ? darkest : "#0F2A1D";
  const accent = palette.filter((c) => c.hex !== primary).sort((a, b) => Math.max(...toRgb(b.hex)) - Math.min(...toRgb(b.hex)) - (Math.max(...toRgb(a.hex)) - Math.min(...toRgb(a.hex))))[0]?.hex ?? "#50C15A";
  const INK = rgb(0.1, 0.11, 0.1);
  const SOFT = rgb(0.4, 0.43, 0.41);
  const LINE = rgb(0.85, 0.87, 0.86);

  let page!: PDFPage;
  let y = 0;
  let pageNo = 0;
  const toc: { title: string; page: number }[] = [];
  const pages: PDFPage[] = [];

  const footer = (p: PDFPage, n: number) => {
    p.drawLine({ start: { x: MX, y: 36 }, end: { x: W - MX, y: 36 }, thickness: 0.5, color: LINE });
    p.drawText(ok(`${input.clientName}  -  ${t.guide}`), { x: MX, y: 22, size: 8, font: regular, color: SOFT });
    p.drawText(String(n), { x: W - MX - regular.widthOfTextAtSize(String(n), 8), y: 22, size: 8, font: regular, color: SOFT });
  };
  const newPage = (title?: string) => {
    page = doc.addPage([W, H]);
    pages.push(page);
    pageNo++;
    if (title) {
      toc.push({ title, page: pageNo });
      page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: col(primary) });
      page.drawRectangle({ x: 0, y: H - 82, width: W, height: 4, color: col(accent) });
      page.drawText(ok(title), { x: MX, y: H - 52, size: 22, font: bold, color: rgb(1, 1, 1) });
      y = H - 120;
    } else y = H - 60;
    footer(page, pageNo);
  };
  const ensure = (h: number) => {
    if (y - h < 60) newPage(); // a continuation page has no title band
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    for (const para of ok(text).split("\n")) {
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
  const para = (text: string | undefined, o: { font?: PDFFont; size?: number; x?: number; width?: number; color?: ReturnType<typeof rgb>; after?: number } = {}) => {
    if (!text) return;
    const font = o.font ?? regular;
    const size = o.size ?? 10.5;
    for (const ln of wrap(text, font, size, o.width ?? CW - ((o.x ?? MX) - MX))) {
      ensure(size + 6);
      page.drawText(ln, { x: o.x ?? MX, y, size, font, color: o.color ?? INK });
      y -= size + 5;
    }
    y -= o.after ?? 6;
  };
  const subhead = (text: string) => {
    ensure(34);
    y -= 6;
    page.drawText(ok(text), { x: MX, y, size: 13, font: bold, color: col(primary) });
    page.drawRectangle({ x: MX, y: y - 6, width: 28, height: 2, color: col(accent) });
    y -= 22;
  };
  const bullets = (items: string[] | undefined, mark = "-", markColor = col(accent)) => {
    for (const it of items ?? []) {
      const lines = wrap(it, regular, 10.5, CW - 16);
      ensure(lines.length * 15 + 2);
      page.drawText(mark, { x: MX + 2, y, size: 10.5, font: bold, color: markColor });
      for (const ln of lines) {
        page.drawText(ln, { x: MX + 16, y, size: 10.5, font: regular, color: INK });
        y -= 15;
      }
      y -= 2;
    }
    y -= 4;
  };

  // A grid of the section's images (3 per row), each with its caption.
  const gallery = async (items: { label: string; bytes: Uint8Array; kind: "png" | "jpg" }[] | undefined) => {
    if (!items?.length) return;
    const cw = (CW - 24) / 3;
    for (let i = 0; i < items.length; i += 3) {
      ensure(cw * 0.75 + 30);
      let rowH = 0;
      for (const [k, it] of items.slice(i, i + 3).entries()) {
        try {
          const img = it.kind === "png" ? await doc.embedPng(it.bytes) : await doc.embedJpg(it.bytes);
          const boxH = cw * 0.75;
          const sc = Math.min((cw - 12) / img.width, (boxH - 12) / img.height);
          const x = MX + k * (cw + 12);
          page.drawRectangle({ x, y: y - boxH, width: cw, height: boxH, color: rgb(0.97, 0.98, 0.97), borderColor: LINE, borderWidth: 0.5 });
          page.drawImage(img, { x: x + (cw - img.width * sc) / 2, y: y - boxH / 2 - (img.height * sc) / 2, width: img.width * sc, height: img.height * sc });
          page.drawText(ok(it.label).slice(0, 40), { x, y: y - boxH - 11, size: 8, font: regular, color: SOFT });
          rowH = boxH + 22;
        } catch {
          /* an image that can't be drawn is skipped */
        }
      }
      y -= rowH || 4;
    }
    y -= 6;
  };

  // ---- cover
  page = doc.addPage([W, H]);
  pages.push(page);
  pageNo++;
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: col(primary) });
  page.drawRectangle({ x: 0, y: H * 0.34, width: W, height: 5, color: col(accent) });
  const coverLogo = input.assets.logos[0];
  if (coverLogo) {
    try {
      const img: PDFImage = coverLogo.kind === "png" ? await doc.embedPng(coverLogo.bytes) : await doc.embedJpg(coverLogo.bytes);
      const s = Math.min(220 / img.width, 110 / img.height, 1);
      page.drawRectangle({ x: MX - 12, y: H - 200 - 12, width: img.width * s + 24, height: img.height * s + 24, color: rgb(1, 1, 1) });
      page.drawImage(img, { x: MX, y: H - 200, width: img.width * s, height: img.height * s });
    } catch {
      /* the logo can't be drawn: the cover simply has no logo */
    }
  }
  page.drawText(ok(t.guide), { x: MX, y: H * 0.34 + 150, size: 44, font: bold, color: rgb(1, 1, 1) });
  for (const [i, ln] of wrap(input.clientName, bold, 22, CW).entries()) page.drawText(ln, { x: MX, y: H * 0.34 + 110 - i * 28, size: 22, font: bold, color: col(accent) });
  if (g.tagline) for (const [i, ln] of wrap(g.tagline, italic, 13, CW).slice(0, 3).entries()) page.drawText(ln, { x: MX, y: H * 0.34 + 60 - i * 18, size: 13, font: italic, color: rgb(0.88, 0.93, 0.9) });
  page.drawText(ok(`${t.prepared}  -  ${new Date().toISOString().slice(0, 10)}`), { x: MX, y: 50, size: 9, font: regular, color: rgb(0.75, 0.82, 0.78) });

  // ---- contents page (filled in at the end)
  newPage();
  const tocPage = page;

  const section = (title: string) => {
    newPage(title);
  };

  if (g.introduction) {
    section(t.introduction);
    for (const p of g.introduction.split(/\n{2,}/)) para(p, { size: 11.5, after: 10 });
  }

  // ---- logos
  const lg = g.logos;
  if (lg || input.assets.logos.length > 0) {
    section(t.logos);
    para(lg?.intro);
    if (input.assets.logos.length > 0) {
      let x = MX;
      let rowH = 0;
      for (const [i, logo] of input.assets.logos.slice(0, 6).entries()) {
        try {
          const img = logo.kind === "png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
          const boxW = (CW - 14) / 2;
          const s = Math.min((boxW - 24) / img.width, 80 / img.height, 1);
          const dark = i % 2 === 1;
          if (i % 2 === 0) {
            ensure(130);
            x = MX;
            rowH = 120;
          }
          page.drawRectangle({ x, y: y - rowH, width: boxW, height: rowH, color: dark ? col(primary) : rgb(0.97, 0.98, 0.97), borderColor: LINE, borderWidth: 0.5 });
          page.drawImage(img, { x: x + (boxW - img.width * s) / 2, y: y - rowH / 2 - (img.height * s) / 2 + 8, width: img.width * s, height: img.height * s });
          page.drawText(ok(logo.label).slice(0, 48), { x: x + 8, y: y - rowH + 8, size: 8, font: regular, color: dark ? rgb(0.85, 0.9, 0.87) : SOFT });
          if (i % 2 === 1 || i === input.assets.logos.slice(0, 6).length - 1) y -= rowH + 12;
          x += boxW + 14;
        } catch {
          /* skip an image that can't be drawn */
        }
      }
    }
    if (input.assets.otherLogoFiles.length > 0) para(`${t.files}: ${input.assets.otherLogoFiles.slice(0, 8).join(", ")}.`, { font: italic, size: 9.5, color: SOFT });
    if (lg?.versions?.length) {
      subhead(t.versions);
      for (const v of lg.versions) para(`${v.name}: ${v.description}`, { after: 3 });
    }
    if (lg?.clearSpace) {
      subhead(t.clearSpace);
      para(lg.clearSpace);
    }
    if (lg?.minimumSize) {
      subhead(t.minimumSize);
      para(lg.minimumSize);
    }
    if (lg?.misuse?.length) {
      subhead(t.misuse);
      bullets(lg.misuse, "x", rgb(0.75, 0.2, 0.2));
    }
  }

  // ---- colours
  if (palette.length > 0) {
    section(t.colours);
    para(g.colours?.intro);
    const cardW = (CW - 14) / 2;
    for (let i = 0; i < palette.length; i += 2) {
      const row = palette.slice(i, i + 2);
      const cardH = 150;
      ensure(cardH + 12);
      row.forEach((c, k) => {
        const x = MX + k * (cardW + 14);
        page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.6 });
        page.drawRectangle({ x, y: y - 62, width: cardW, height: 62, color: col(c.hex) });
        const [r, gg, b] = toRgb(c.hex);
        page.drawText(ok(c.name).slice(0, 34), { x: x + 10, y: y - 80, size: 11.5, font: bold, color: INK });
        page.drawText(`${c.hex}   RGB ${r}, ${gg}, ${b}`, { x: x + 10, y: y - 94, size: 8.5, font: regular, color: SOFT });
        const w = contrast(c.hex, "#FFFFFF");
        const bl = contrast(c.hex, "#000000");
        page.drawText(`${t.onWhite} ${w.toFixed(1)}:1 ${level(w)}   |   ${t.onBlack} ${bl.toFixed(1)}:1 ${level(bl)}`, { x: x + 10, y: y - 106, size: 7.5, font: regular, color: SOFT });
        const text = [c.role, c.usage].filter(Boolean).join(" - ");
        wrap(text, regular, 8.5, cardW - 20).slice(0, 3).forEach((ln, n) => page.drawText(ln, { x: x + 10, y: y - 120 - n * 11, size: 8.5, font: regular, color: INK }));
      });
      y -= cardH + 12;
    }
  }

  // ---- typography
  const ty = g.typography;
  if (ty && (ty.fonts?.length || ty.scale?.length)) {
    section(t.typography);
    para(ty.intro);
    for (const f of ty.fonts ?? []) {
      ensure(86);
      page.drawRectangle({ x: MX, y: y - 76, width: CW, height: 76, color: rgb(0.97, 0.98, 0.97), borderColor: LINE, borderWidth: 0.5 });
      page.drawText(ok(f.name).slice(0, 40), { x: MX + 12, y: y - 32, size: 24, font: bold, color: col(primary) });
      page.drawText(ok("Aa Bb Cc 123  -  The quick brown fox").slice(0, 60), { x: MX + 12, y: y - 52, size: 11, font: regular, color: INK });
      wrap([f.role, f.usage].filter(Boolean).join(" - "), regular, 9, CW - 24).slice(0, 2).forEach((ln, n) => page.drawText(ln, { x: MX + 12, y: y - 66 - n * 10 + (n ? 0 : 0), size: 9, font: regular, color: SOFT }));
      y -= 88;
    }
    para(t.specimen, { font: italic, size: 8.5, color: SOFT });
    if (ty.scale?.length) {
      subhead(t.scale);
      for (const s of ty.scale) {
        ensure(24);
        page.drawText(ok(s.style).slice(0, 28), { x: MX, y, size: 10.5, font: bold, color: INK });
        page.drawText(ok([s.size, s.lineHeight && `/ ${s.lineHeight}`, s.weight].filter(Boolean).join("   ")), { x: MX + 190, y, size: 10.5, font: regular, color: SOFT });
        page.drawLine({ start: { x: MX, y: y - 6 }, end: { x: W - MX, y: y - 6 }, thickness: 0.4, color: LINE });
        y -= 22;
      }
    }
  }

  // ---- rule sections (with the section's images)
  for (const [key, title, imgKey] of [["iconography", t.iconography, "icons"], ["graphics", t.graphics, "graphics"], ["photography", t.photography, "photos"], ["components", t.components, "components"], ["charts", t.charts, "charts"]] as const) {
    const r = g[key];
    const imgs = input.assets.images[imgKey];
    if ((!r || (!r.intro && !r.rules?.length)) && !imgs?.length) continue;
    section(title);
    para(r?.intro);
    await gallery(imgs);
    bullets(r?.rules);
  }

  // ---- voice
  const v = g.voice;
  if (v && (v.intro || v.attributes?.length || v.dos?.length || v.donts?.length || v.samples?.length)) {
    section(t.voice);
    para(v.intro);
    if (v.attributes?.length) {
      subhead(t.attributes);
      const cw = (CW - 14) / 2;
      for (let i = 0; i < v.attributes.length; i += 2) {
        const row = v.attributes.slice(i, i + 2);
        const h = Math.max(...row.map((a) => 34 + wrap(a.description, regular, 9, cw - 20).length * 11)) + 6;
        ensure(h + 10);
        row.forEach((a, k) => {
          const x = MX + k * (cw + 14);
          page.drawRectangle({ x, y: y - h, width: cw, height: h, color: rgb(0.97, 0.98, 0.97), borderColor: LINE, borderWidth: 0.5 });
          page.drawRectangle({ x, y: y - h, width: 4, height: h, color: col(accent) });
          page.drawText(ok(a.name).slice(0, 30), { x: x + 14, y: y - 18, size: 11.5, font: bold, color: col(primary) });
          wrap(a.description, regular, 9, cw - 24).forEach((ln, n) => page.drawText(ln, { x: x + 14, y: y - 32 - n * 11, size: 9, font: regular, color: INK }));
        });
        y -= h + 10;
      }
    }
    if (v.dos?.length) {
      subhead(t.dos);
      bullets(v.dos, "+", rgb(0.15, 0.55, 0.25));
    }
    if (v.donts?.length) {
      subhead(t.donts);
      bullets(v.donts, "x", rgb(0.75, 0.2, 0.2));
    }
    if (v.samples?.length) {
      subhead(t.samples);
      for (const s of v.samples) {
        const lines = wrap(`"${s}"`, italic, 11, CW - 28);
        ensure(lines.length * 15 + 14);
        page.drawRectangle({ x: MX, y: y - lines.length * 15 - 6, width: 3, height: lines.length * 15 + 6, color: col(accent) });
        lines.forEach((ln, n) => page.drawText(ln, { x: MX + 14, y: y - 12 - n * 15, size: 11, font: italic, color: INK }));
        y -= lines.length * 15 + 16;
      }
    }
  }

  if (g.closing) {
    ensure(80);
    y -= 10;
    para(g.closing, { font: italic, size: 11, color: SOFT });
  }

  // ---- contents (now that the pages are known)
  tocPage.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: col(primary) });
  tocPage.drawRectangle({ x: 0, y: H - 82, width: W, height: 4, color: col(accent) });
  tocPage.drawText(ok(t.contents), { x: MX, y: H - 52, size: 22, font: bold, color: rgb(1, 1, 1) });
  let ty2 = H - 130;
  for (const e of toc) {
    tocPage.drawText(ok(e.title), { x: MX, y: ty2, size: 13, font: regular, color: INK });
    const num = String(e.page);
    tocPage.drawText(num, { x: W - MX - regular.widthOfTextAtSize(num, 13), y: ty2, size: 13, font: bold, color: col(primary) });
    tocPage.drawLine({ start: { x: MX, y: ty2 - 8 }, end: { x: W - MX, y: ty2 - 8 }, thickness: 0.4, color: LINE });
    ty2 -= 30;
  }
  return doc.save();
}

// ---- the content, written by Claude ------------------------------------------------

const MODEL = "claude-sonnet-5-5";

// The guide is written in small parts (each one a short request): a single request for the whole guide
// takes minutes, longer than the 100 s the web connection can stay open. The browser asks for the parts
// in parallel, then sends them together to be drawn.
export const GUIDE_PARTS: { id: string; shape: string }[] = [
  { id: "intro", shape: '{"tagline": "", "introduction": "2 short paragraphs separated by a blank line", "logos": {"intro": "", "versions": [{"name": "", "description": ""}], "clearSpace": "", "minimumSize": "", "misuse": [""]}}' },
  { id: "colours-type", shape: '{"colours": {"intro": "", "palette": [{"name": "", "hex": "#RRGGBB", "role": "Primary/Secondary/Accent/Neutral", "usage": ""}]}, "typography": {"intro": "", "fonts": [{"name": "", "role": "", "usage": ""}], "scale": [{"style": "H1", "size": "40 px", "lineHeight": "1.2", "weight": "Bold"}]}}' },
  { id: "visuals", shape: '{"iconography": {"intro": "", "rules": [""]}, "graphics": {"intro": "", "rules": [""]}, "photography": {"intro": "", "rules": [""]}, "components": {"intro": "", "rules": [""]}, "charts": {"intro": "", "rules": [""]}}' },
  { id: "voice", shape: '{"voice": {"intro": "", "attributes": [{"name": "", "description": ""}], "dos": [""], "donts": [""], "samples": [""]}, "closing": ""}' },
];

export async function writeGuidePart(input: {
  apiKey: string;
  lang: "en" | "fr";
  part: number;
  clientName: string;
  industry?: string | null;
  reports: string[];
  cardLines: string[];
}): Promise<Partial<GuideDoc> | { error: string }> {
  const spec = GUIDE_PARTS[input.part];
  if (!spec) return { error: "Unknown part." };
  const language = input.lang === "fr" ? "Canadian French (français du Québec, professional, with proper accents)" : "English";
  const reports = input.reports.map((r, i) => `=== BRAND REPORT ${i + 1} ===\n${r.slice(0, 22_000)}`).join("\n\n");
  const prompt = `You are writing part of the final BRAND GUIDE of a client, to be laid out as a designed PDF.

Client: ${input.clientName}${input.industry ? ` (${input.industry})` : ""}

Several brand reports were written for this client by different AI assistants, and the brand card of the CRM holds what the client already has or approved. COMBINE them into ONE coherent guide:
- Keep every useful idea from all the reports; remove duplicates; where they disagree, keep what is best justified and most consistent. Values on the brand card (marked "card") are authoritative and win.
- Never mention the reports, the AIs or their differences. Write as the brand's own guide.
- Colours: only #RRGGBB values that appear in the sources. Do not invent colours.
- Ignore code, SVG markup and file lists: describe assets in words.
- Write all text in ${language}. Be concrete and complete, but keep each paragraph short.

Respond with ONLY one JSON object (no markdown fences) in exactly this shape; use [] or "" when the sources say nothing about a field:
${spec.shape}

BRAND CARD:
${input.cardLines.join("\n") || "(empty)"}

${reports}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4_000, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(85_000),
    });
    if (!res.ok) return { error: `The AI request failed (HTTP ${res.status}: ${(await res.text()).slice(0, 140)}).` };
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    if (data.stop_reason === "max_tokens") return { error: "The AI's reply was cut off." };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return { error: "The AI didn't return usable content." };
    return JSON.parse(text.slice(start, end + 1)) as Partial<GuideDoc>;
  } catch (err) {
    return { error: `The AI request failed (${err instanceof Error ? err.message : "error"}).` };
  }
}

// Whatever the AI returned, make every list a list and every text a text, so the PDF can always be drawn.
export function normaliseGuide(raw: Partial<GuideDoc>): GuideDoc {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const arr = <T,>(v: unknown, f: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null) : []);
  const strs = (v: unknown) => arr<string>(v, (x) => (typeof x === "string" && x.trim() ? x : null));
  const rules = (v: unknown): Rules | undefined => {
    const o = (v ?? {}) as { intro?: unknown; rules?: unknown };
    return { intro: str(o.intro), rules: strs(o.rules) };
  };
  const r = raw as Record<string, Record<string, unknown> | undefined>;
  return {
    tagline: str(raw.tagline),
    introduction: str(raw.introduction),
    logos: {
      intro: str(r.logos?.intro),
      versions: arr(r.logos?.versions, (x) => { const o = x as { name?: unknown; description?: unknown }; return str(o?.name) ? { name: str(o.name)!, description: str(o.description) ?? "" } : null; }),
      clearSpace: str(r.logos?.clearSpace),
      minimumSize: str(r.logos?.minimumSize),
      misuse: strs(r.logos?.misuse),
    },
    colours: {
      intro: str(r.colours?.intro),
      palette: arr(r.colours?.palette, (x) => { const o = x as { name?: unknown; hex?: unknown; role?: unknown; usage?: unknown }; return str(o?.hex) ? { name: str(o.name) ?? str(o.hex)!, hex: str(o.hex)!, role: str(o.role), usage: str(o.usage) } : null; }),
    },
    typography: {
      intro: str(r.typography?.intro),
      fonts: arr(r.typography?.fonts, (x) => { const o = x as { name?: unknown; role?: unknown; usage?: unknown }; return str(o?.name) ? { name: str(o.name)!, role: str(o.role), usage: str(o.usage) } : null; }),
      scale: arr(r.typography?.scale, (x) => { const o = x as { style?: unknown; size?: unknown; lineHeight?: unknown; weight?: unknown }; return str(o?.style) ? { style: str(o.style)!, size: str(o.size) ?? "", lineHeight: str(o.lineHeight), weight: str(o.weight) } : null; }),
    },
    iconography: rules(raw.iconography),
    graphics: rules(raw.graphics),
    photography: rules(raw.photography),
    components: rules(raw.components),
    charts: rules(raw.charts),
    voice: {
      intro: str(r.voice?.intro),
      attributes: arr(r.voice?.attributes, (x) => { const o = x as { name?: unknown; description?: unknown }; return str(o?.name) ? { name: str(o.name)!, description: str(o.description) ?? "" } : null; }),
      dos: strs(r.voice?.dos),
      donts: strs(r.voice?.donts),
      samples: strs(r.voice?.samples),
    },
    closing: str(raw.closing),
  };
}
