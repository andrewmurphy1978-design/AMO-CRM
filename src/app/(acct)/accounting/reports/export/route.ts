import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { accountingUserFor } from "@/lib/accounting/access";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { loadBooks } from "@/lib/accounting/options";
import { reportRows, toCsv, type ReportParams } from "@/lib/accounting/report-export";
import { buildReportPdf } from "@/lib/accounting/report-pdf";
import { getLang } from "@/lib/i18n/get-lang";

// GET /accounting/reports/export?r=is&entity=...&year=... — the report on screen, as a CSV file (format=pdf: a PDF).
export async function GET(request: Request) {
  const session = await auth();
  const url = new URL(request.url);
  const p: ReportParams = { acc: url.searchParams.getAll("acc") };
  for (const k of ["r", "entity", "year", "month", "from", "to", "account", "metric", "by", "count", "yoy", "group"] as const) {
    const v = url.searchParams.get(k);
    if (v) p[k] = v;
  }
  const lang = await getLang();
  const out = await withScopedPrismaClient(async (db) => {
    const me = await accountingUserFor(db, session);
    if (!me) return null;
    await ensureAccountingSetup(db, me);
    const { entities, options } = await loadBooks(db, me.id);
    const entity = entities.find((e) => e.id === p.entity) ?? entities[0];
    const rep = await reportRows(db, entity, options, p, lang);
    return { ...rep, entityName: entity.name };
  });
  if (!out) return new NextResponse("Not allowed", { status: 403 });
  const safe = (t: string) => t.normalize("NFD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  if (url.searchParams.get("format") === "pdf") {
    const pdf = await buildReportPdf({ rows: out.rows, skip: out.skip, lang, generated: stamp });
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safe(out.entityName)}-${out.title}-${stamp}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new NextResponse(toCsv(out.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe(out.entityName)}-${out.title}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
