import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// A PDF of a report built from the same rows as the CSV export: a header, then the table with the numeric columns
// right-aligned, totals in bold, long text cut to fit, and the column header repeated on each page. Pure pdf-lib.

const NUMERIC = /^-?\d+(\.\d{2})$/;

// Helvetica (WinAnsi) cannot draw every character: swap the few we use that it cannot.
const ascii = (t: string) => t.replace(/→/g, "to").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ—–•]/g, "?");

function money(v: string): string {
  const n = Number(v);
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${d}`;
}

export async function buildReportPdf(input: { rows: (string | number)[][]; skip: number; lang: "en" | "fr"; generated: string }): Promise<Uint8Array> {
  const { rows, skip, lang } = input;
  const entity = String(rows[0]?.[0] ?? "");
  const title = String(rows[1]?.[0] ?? "");
  const sub = rows.slice(2, skip).map((r) => r.join("  ")).filter(Boolean).join("   ");
  const body = rows.slice(skip).map((r) => r.map((c) => String(c ?? "")));
  const cols = Math.max(2, ...body.map((r) => r.length));

  // Numeric columns: a column is numeric when most of its filled cells (past the label columns) look like amounts.
  const isNum = Array.from({ length: cols }, (_, c) => {
    const cells = body.map((r) => r[c]).filter((x) => x !== undefined && x !== "");
    return cells.length > 0 && cells.filter((x) => NUMERIC.test(x)).length / cells.length >= 0.5;
  });
  const wide = cols > 5;
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const PAGE: [number, number] = wide ? [841.89, 595.28] : [595.28, 841.89];
  const M = 40;
  const numW = wide ? 66 : 78;
  const size = wide ? 8 : 9;
  const rowH = size + 6;
  const textCols = isNum.map((x, i) => (!x ? i : -1)).filter((i) => i >= 0);
  const tableW = PAGE[0] - M * 2;
  const textW = Math.max(60, (tableW - isNum.filter(Boolean).length * numW) / Math.max(1, textCols.length));
  // A narrow first column (account codes, dates) does not need a full text column's share.
  const firstShort = !isNum[0] && body.every((r) => (r[0] ?? "").length <= 10 || (r.filter((x) => x !== "").length === 1) || /^(total|net|r\u00e9sultat|marge|gross|solde|balance)/i.test(r[0] ?? ""));
  const firstW = firstShort ? 62 : textW;
  const restTextW = firstShort ? Math.max(60, (tableW - isNum.filter(Boolean).length * numW - firstW) / Math.max(1, textCols.length - 1)) : textW;
  const colW = isNum.map((x, i) => (x ? numW : i === 0 ? firstW : restTextW));
  const colX: number[] = [];
  colW.reduce((x, w, i) => ((colX[i] = x), x + w), M);

  const fit = (text: string, font: PDFFont, maxW: number) => {
    let t = ascii(text);
    if (font.widthOfTextAtSize(t, size) <= maxW) return t;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxW) t = t.slice(0, -1);
    return `${t}...`;
  };

  let page!: PDFPage;
  let y = 0;
  let pageNo = 0;
  const header = (): void => {
    page = doc.addPage(PAGE);
    pageNo++;
    y = PAGE[1] - M;
    page.drawText(ascii(entity), { x: M, y, size: 15, font: bold, color: rgb(0.1, 0.25, 0.18) });
    y -= 18;
    page.drawText(ascii(title), { x: M, y, size: 11, font: bold, color: rgb(0.2, 0.2, 0.2) });
    y -= 14;
    if (sub) page.drawText(fit(sub, regular, tableW), { x: M, y, size: 9, font: regular, color: rgb(0.4, 0.4, 0.4) });
    y -= 20;
  };
  header();

  const drawRow = (r: string[], style: "head" | "total" | "section" | "normal") => {
    if (y < M + 20) {
      header();
    }
    const font = style === "normal" ? regular : bold;
    if (style === "total") page.drawLine({ start: { x: M, y: y + rowH - 3 }, end: { x: M + tableW, y: y + rowH - 3 }, thickness: 0.6, color: rgb(0.6, 0.6, 0.6) });
    if (style === "head") page.drawRectangle({ x: M, y: y - 3, width: tableW, height: rowH, color: rgb(0.93, 0.95, 0.93) });
    if (style === "section") {
      page.drawText(fit(r[0] ?? "", bold, tableW), { x: M, y, size, font: bold, color: rgb(0.1, 0.25, 0.18) });
    } else {
      for (let c = 0; c < cols; c++) {
        const raw = r[c] ?? "";
        if (raw === "") continue;
        const shown = isNum[c] && NUMERIC.test(raw) ? money(raw) : raw;
        const text = fit(shown, font, colW[c] - 6);
        const w = font.widthOfTextAtSize(text, size);
        page.drawText(text, { x: isNum[c] ? colX[c] + colW[c] - 6 - w : colX[c], y, size, font, color: rgb(0.1, 0.1, 0.1) });
      }
    }
    y -= rowH;
  };

  // Rows whose first cell starts a total (or the net result) are bold; a lone cell is a section heading.
  const totalRe = /^(total|net|résultat net|marge brute|gross profit|solde|balance owing)/i;
  body.forEach((r, i) => {
    const filled = r.filter((x) => x !== "").length;
    if (filled === 0) {
      y -= rowH / 2;
      return;
    }
    const looksHead = i === 0 && r.every((x) => !NUMERIC.test(x)) && filled >= 3;
    if (looksHead) drawRow(r, "head");
    else if (filled === 1 && !NUMERIC.test(r[0])) drawRow(r, "section");
    else if (totalRe.test(r[0] ?? "") || totalRe.test(r[1] ?? "")) drawRow(r, "total");
    else drawRow(r, "normal");
  });

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `${lang === "fr" ? "Page" : "Page"} ${i + 1} / ${pages.length} — ${input.generated}`;
    p.drawText(ascii(label), { x: M, y: 22, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });
  });
  void pageNo;
  return doc.save();
}
