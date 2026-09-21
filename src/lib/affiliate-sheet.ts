import type { PrismaClient } from "@/lib/prisma";

// The "AMO Affiliate Link Tracker" Google Sheet — see the AffiliateProgram
// model's own comment in schema.prisma. Fetched via the sheet's public
// "gviz" CSV export (no Google OAuth needed), which only works while the
// sheet's sharing is set to "Anyone with the link — Viewer". If sharing is
// ever tightened back to private, every sync below starts failing with a
// non-CSV (login-page) response.
const SHEET_ID = "1dJ9sZz6fHNvwK7I_nKH72Ai1VWt1x_mUh_XQ6g7YWkg";

const TABS = [
  { tab: "AI_TOOLS" as const, sheetName: "AI Tools" },
  { tab: "TRAINING_PROGRAMS" as const, sheetName: "Training Programs" },
  { tab: "BUSINESS_OPPORTUNITIES" as const, sheetName: "Business Opportunities" },
];

// The three tabs above share this exact 12-column layout (in this order).
const COLUMNS = [
  "name",
  "type",
  "category",
  "shortioCreated",
  "brandedLink",
  "destinationLink",
  "affiliateStatus",
  "frenchSlug",
  "frenchLink",
  "followUpNeeded",
  "notes",
  "accountPlan",
] as const;

// A minimal RFC 4180 CSV parser — handles quoted fields, embedded commas/
// newlines, and "" as an escaped quote. Google's CSV export never emits a
// BOM or CRLF-only quirks beyond this, so nothing fancier is needed and it
// avoids pulling in a dependency for one fixed, well-behaved data source.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function isYes(value: string | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "yes";
}

async function fetchTabRows(sheetName: string): Promise<Record<string, string>[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Affiliate sheet tab "${sheetName}" fetch failed: HTTP ${res.status}`);
  }
  const text = await res.text();
  // A private (not link-shared) sheet redirects to an HTML sign-in page
  // instead of a 4xx — the clearest tell is that it isn't CSV at all.
  if (!text.trimStart().startsWith('"') && !/^[^,\n]*,/.test(text)) {
    throw new Error(`Affiliate sheet tab "${sheetName}" did not return CSV — check that it's shared as "Anyone with the link".`);
  }
  const rows = parseCsv(text);
  const [, ...dataRows] = rows; // first row is the header, already known
  return dataRows.map((cells) => {
    const record: Record<string, string> = {};
    COLUMNS.forEach((col, i) => {
      record[col] = (cells[i] ?? "").trim();
    });
    return record;
  });
}

export interface AffiliateSheetSyncResult {
  synced: number;
  errors: string[];
}

// Upserts every program row from all three tabs, keyed by (tab, name) — the
// sheet's own natural key. Never deletes: a program removed from the sheet
// just stops being refreshed, matching how the systeme.io sync in
// src/lib/sync.ts also never deletes rows that disappeared upstream.
export async function syncAffiliateSheet(db: PrismaClient): Promise<AffiliateSheetSyncResult> {
  let synced = 0;
  const errors: string[] = [];

  for (const { tab, sheetName } of TABS) {
    let records: Record<string, string>[];
    try {
      records = await fetchTabRows(sheetName);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Failed to fetch "${sheetName}"`);
      continue;
    }

    for (const record of records) {
      if (!record.name) continue;
      const data = {
        type: record.type || null,
        category: record.category || null,
        shortioCreated: isYes(record.shortioCreated),
        brandedLink: record.brandedLink || null,
        destinationLink: record.destinationLink || null,
        affiliateStatus: record.affiliateStatus || null,
        frenchSlug: record.frenchSlug || null,
        frenchLink: record.frenchLink || null,
        followUpNeeded: isYes(record.followUpNeeded),
        notes: record.notes || null,
        accountPlan: record.accountPlan || null,
      };
      await db.affiliateProgram.upsert({
        where: { tab_name: { tab, name: record.name } },
        update: data,
        create: { tab, name: record.name, ...data },
      });
      synced++;
    }
  }

  return { synced, errors };
}
