import { NextResponse } from "next/server";
import { withScopedPrismaClient } from "@/lib/prisma";
import { scanEmailForInvoices, matchWaitingDocuments } from "@/lib/accounting/documents";

// Every 15 minutes: reads new emails for invoices and receipts for each person who keeps books, attaches them to
// the matching transaction, and keeps the rest aside for the next import (see src/lib/accounting/documents.ts).
// Each run is bounded, so a backlog is worked through over several runs.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await withScopedPrismaClient(async (db) => {
    const owners = (await db.accEntity.findMany({ distinct: ["ownerId"], select: { ownerId: true } })).map((e) => e.ownerId).filter((o): o is string => Boolean(o));
    const out: { ownerId: string; documents?: number; attached?: number; matchedLater?: number; error?: string }[] = [];
    for (const ownerId of owners) {
      try {
        const scan = await scanEmailForInvoices(db, ownerId, { maxMessages: 8, maxAi: 4 });
        const matchedLater = await matchWaitingDocuments(db, ownerId);
        out.push({ ownerId, documents: scan.documents, attached: scan.attached, matchedLater });
      } catch (e) {
        out.push({ ownerId, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  });
  return NextResponse.json({ ok: true, results });
}
