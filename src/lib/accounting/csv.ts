// Reading a bank / credit-card statement exported as CSV. Banks disagree on delimiters, headers, date order and
// how amounts are signed, so the columns are detected (and shown to the user to correct before importing).

export type DateOrder = "YMD" | "DMY" | "MDY";

export interface ColumnMap {
  date: number;
  description: number;
  // Either one signed amount column, or separate debit (money out) and credit (money in) columns.
  amount: number | null;
  debit: number | null;
  credit: number | null;
  dateOrder: DateOrder;
}

export interface ParsedRow {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // statement sign: positive = money in when the file is a bank account
}

/** Splits CSV text into rows of cells (quotes, escaped quotes, , ; or tab delimiters). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLines = clean.split(/\r?\n/).slice(0, 5).join("\n");
  const count = (ch: string) => (firstLines.match(new RegExp(`\\${ch}`, "g")) ?? []).length;
  const delimiter = [",", ";", "\t"].sort((x, y) => count(y) - count(x))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
  return rows;
}

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, january: 1, janvier: 1, feb: 2, fev: 2, fevr: 2, february: 2, fevrier: 2, mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, april: 4, avril: 4, may: 5, mai: 5, jun: 6, juin: 6, june: 6, jul: 7, juil: 7, july: 7, juillet: 7,
  aug: 8, aout: 8, august: 8, sep: 9, sept: 9, september: 9, septembre: 9, oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11, dec: 12, december: 12, decembre: 12,
};

const iso = (y: number, m: number, d: number): string | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const year = y < 100 ? 2000 + y : y;
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** A date cell as YYYY-MM-DD, or null. `order` only matters for numeric dates like 03/04/2026. */
export function parseDate(value: string, order: DateOrder): string | null {
  const v = value.trim();
  if (!v) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(v);
  if (m) return order === "MDY" ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
  // "Jan 5, 2026" / "5 janv. 2026"
  const name = (s: string) => MONTHS[s.toLowerCase().normalize("NFD").replace(/[̀-ͯ.]/g, "")];
  m = /^([A-Za-zÀ-ÿ.]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(v);
  if (m && name(m[1])) return iso(+m[3], name(m[1]), +m[2]);
  m = /^(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})/.exec(v);
  if (m && name(m[2])) return iso(+m[3], name(m[2]), +m[1]);
  return null;
}

/** An amount cell as a number: "1 234,56", "1,234.56", "(12.30)", "$-5", "12.30-", "12.30 CR". */
export function parseAmount(value: string): number | null {
  let v = value.trim();
  if (!v) return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (/-$/.test(v)) {
    negative = true;
    v = v.slice(0, -1);
  }
  if (/\bDR\b/i.test(v)) negative = true;
  v = v.replace(/\b(CR|DR)\b/gi, "").replace(/[A-Za-z$€£\s ]/g, "");
  if (v.startsWith("-")) {
    negative = !negative || negative; // an explicit minus always means negative
    v = v.slice(1);
    negative = true;
  } else if (v.startsWith("+")) v = v.slice(1);
  if (!/\d/.test(v)) return null;
  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // the later separator is the decimal one
    v = lastComma > lastDot ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
  } else if (lastComma > -1) {
    v = /,\d{2}$/.test(v) ? v.replace(/,/g, ".") : v.replace(/,/g, "");
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const HEADERS = {
  date: ["date", "transaction date", "date de la transaction", "date de transaction", "posted date", "date d'inscription", "date inscription", "booking date"],
  description: ["description", "description 1", "details", "détails", "libellé", "libelle", "memo", "payee", "merchant", "narrative", "transaction", "nom"],
  amount: ["amount", "montant", "amount cad", "montant cad", "transaction amount"],
  debit: ["debit", "débit", "withdrawal", "withdrawals", "retrait", "retraits", "montant débit", "paid out", "amount debit"],
  credit: ["credit", "crédit", "deposit", "deposits", "dépôt", "depot", "dépôts", "montant crédit", "paid in", "amount credit"],
};
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

export function detectDateOrder(rows: string[][], col: number): DateOrder {
  let dmy = false;
  let mdy = false;
  for (const r of rows.slice(0, 500)) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec((r[col] ?? "").trim());
    if (!m) {
      if (/^\d{4}[-/.]/.test((r[col] ?? "").trim())) return "YMD";
      continue;
    }
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  return mdy && !dmy ? "MDY" : "DMY";
}

/** Finds the header row (if any) and guesses the columns. Returns null when it cannot tell. */
export function detectColumns(rows: string[][]): { headerRow: number; map: ColumnMap | null; headers: string[] } {
  let headerRow = -1;
  let headers: string[] = [];
  const named = (cells: string[]) => cells.map(norm);
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = named(rows[i]);
    const hits = (["date", "description", "amount", "debit", "credit"] as const).filter((k) => cells.some((c) => HEADERS[k].map(norm).includes(c))).length;
    if (hits >= 2) {
      headerRow = i;
      headers = rows[i];
      break;
    }
  }
  const body = rows.slice(headerRow + 1);
  const find = (k: keyof typeof HEADERS) => (headerRow >= 0 ? named(rows[headerRow]).findIndex((c) => HEADERS[k].map(norm).includes(c)) : -1);
  let date = find("date");
  let description = find("description");
  let amount = find("amount");
  const debit = find("debit");
  const credit = find("credit");

  // No usable header: guess from the data.
  const width = Math.max(0, ...body.slice(0, 30).map((r) => r.length));
  if (date < 0) {
    for (let c = 0; c < width; c++) if (body.slice(0, 30).filter((r) => parseDate(r[c] ?? "", "DMY") || parseDate(r[c] ?? "", "MDY")).length >= Math.min(5, body.length) * 0.8) { date = c; break; }
  }
  let debitCol = debit;
  let creditCol = credit;
  if (amount < 0 && debit < 0 && credit < 0) {
    // Numeric columns after the date: a column filled on nearly every row is an amount (or the balance); two
    // columns that are each filled on only some rows, never together, are money out / money in (in that order).
    const sample = body.slice(0, 60);
    const numeric = [];
    for (let c = 0; c < width; c++) {
      if (c === date || c === description) continue;
      const filled = sample.filter((r) => parseAmount(r[c] ?? "") !== null && /\d[.,]\d{2}\s*$/.test((r[c] ?? "").trim())).length;
      if (filled >= Math.max(2, sample.length * 0.15)) numeric.push({ c, fill: filled / Math.max(1, sample.length) });
    }
    const sparse = numeric.filter((n) => n.fill < 0.95);
    const exclusive = (x: number, y: number) => !sample.some((r) => parseAmount(r[x] ?? "") !== null && parseAmount(r[y] ?? "") !== null);
    if (sparse.length >= 2 && exclusive(sparse[0].c, sparse[1].c)) {
      debitCol = sparse[0].c;
      creditCol = sparse[1].c;
    } else if (numeric.length > 0) {
      amount = numeric[0].c;
    }
  }
  if (description < 0) {
    let best = -1;
    let bestLen = 0;
    for (let c = 0; c < width; c++) {
      if (c === date || c === amount || c === debitCol || c === creditCol) continue;
      const len = body.slice(0, 30).reduce((s, r) => s + (parseAmount(r[c] ?? "") === null ? (r[c] ?? "").length : 0), 0);
      if (len > bestLen) {
        bestLen = len;
        best = c;
      }
    }
    description = best;
  }
  if (date < 0 || description < 0 || (amount < 0 && debitCol < 0 && creditCol < 0)) return { headerRow, map: null, headers };
  return { headerRow, headers, map: { date, description, amount: amount >= 0 ? amount : null, debit: debitCol >= 0 ? debitCol : null, credit: creditCol >= 0 ? creditCol : null, dateOrder: detectDateOrder(body, date) } };
}

/** Rows -> transactions with a statement-signed amount. Rows that are not transactions (totals, notes) are skipped. */
export function toTransactions(rows: string[][], headerRow: number, map: ColumnMap): { rows: ParsedRow[]; skipped: number } {
  const out: ParsedRow[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerRow + 1)) {
    const date = parseDate(r[map.date] ?? "", map.dateOrder);
    let amount: number | null = null;
    if (map.amount !== null) amount = parseAmount(r[map.amount] ?? "");
    if (amount === null && (map.debit !== null || map.credit !== null)) {
      const debit = map.debit !== null ? parseAmount(r[map.debit] ?? "") : null;
      const credit = map.credit !== null ? parseAmount(r[map.credit] ?? "") : null;
      if (debit !== null && debit !== 0) amount = -Math.abs(debit);
      else if (credit !== null && credit !== 0) amount = Math.abs(credit);
    }
    const description = (r[map.description] ?? "").trim();
    if (!date || amount === null || amount === 0 || !description) {
      skipped++;
      continue;
    }
    out.push({ date, description, amount });
  }
  return { rows: out, skipped };
}
