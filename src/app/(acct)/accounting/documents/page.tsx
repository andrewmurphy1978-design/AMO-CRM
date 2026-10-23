import { withScopedPrismaClient } from "@/lib/prisma";
import { requireAccountingUser } from "../session";
import { getLang } from "@/lib/i18n/get-lang";
import { isoDate } from "@/lib/accounting/format";
import { waitingWhere } from "@/lib/accounting/documents";
import DocumentsPanel, { type WaitingDoc, type AttachedDoc } from "./documents-panel";

export default async function DocumentsPage() {
  const me = await requireAccountingUser();
  const lang = await getLang();
  const { waiting, attached } = await withScopedPrismaClient(async (db) => {
    const pick = { id: true, filename: true, mimeType: true, vendor: true, docDate: true, amount: true, currency: true, subject: true, fromLabel: true, invoiceNumber: true } as const;
    const waiting = await db.accDocument.findMany({ where: waitingWhere(me.id), orderBy: { createdAt: "desc" }, take: 200, select: pick });
    const attached = await db.accDocument.findMany({
      where: { ownerId: me.id, status: "ATTACHED", source: "email" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { ...pick, transaction: { select: { date: true, supplier: true, description: true } } },
    });
    return { waiting, attached };
  });
  const wd: WaitingDoc[] = waiting.map((d) => ({ id: d.id, filename: d.filename, vendor: d.vendor, docDate: d.docDate ? isoDate(d.docDate) : null, amount: d.amount, currency: d.currency, subject: d.subject, fromLabel: d.fromLabel, invoiceNumber: d.invoiceNumber }));
  const ad: AttachedDoc[] = attached.map((d) => ({
    id: d.id, filename: d.filename, vendor: d.vendor, docDate: d.docDate ? isoDate(d.docDate) : null, amount: d.amount, currency: d.currency, subject: d.subject,
    txLabel: d.transaction ? `${isoDate(d.transaction.date)} · ${d.transaction.supplier || d.transaction.description}` : "",
  }));
  return <DocumentsPanel lang={lang} waiting={wd} attached={ad} />;
}
