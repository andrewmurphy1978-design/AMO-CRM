import type { PrismaClient } from "@/lib/prisma";

// Supplier invoices paid on the client's behalf are passed on at cost:
//  - paid before the proposal was issued (or while it's still a draft) -> they
//    are listed in the proposal (and attached to its PDF);
//  - paid after the proposal was issued -> they are added to the next client
//    invoice (and attached to its PDF) — the newest invoice still in draft.

const round = (n: number) => Math.round(n * 100) / 100;
const costDate = (c: { paidDate: Date | null; createdAt: Date }) => c.paidDate ?? c.createdAt;

export async function proposalSupplierCosts(db: PrismaClient, projectId: string, proposal: { sentAt: Date | null }) {
  const all = await db.projectSupplierInvoice.findMany({
    where: { projectId, reimbursable: true, attachToProposal: true, billedInvoiceId: null, reimbursementStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  return all.filter((c) => !proposal.sentAt || costDate(c).getTime() <= proposal.sentAt.getTime());
}

// Adds the supplier costs paid after the accepted proposal was issued to the
// newest unsent invoice. Idempotent: costs already billed are skipped.
export async function billPendingSupplierCosts(db: PrismaClient, projectId: string): Promise<void> {
  const proposal = await db.proposal.findFirst({ where: { projectId, status: "ACCEPTED", sentAt: { not: null } }, orderBy: { respondedAt: "desc" }, select: { sentAt: true } });
  if (!proposal?.sentAt) return;
  const invoice = await db.invoice.findFirst({ where: { projectId, status: "DRAFT", approvedAt: null }, orderBy: { createdAt: "desc" }, include: { lineItems: { select: { order: true } } } });
  if (!invoice) return;

  const pending = (
    await db.projectSupplierInvoice.findMany({ where: { projectId, reimbursable: true, billedInvoiceId: null, reimbursementStatus: "PENDING" }, orderBy: { createdAt: "asc" } })
  ).filter((c) => costDate(c).getTime() > proposal.sentAt!.getTime());
  if (pending.length === 0) return;

  let order = invoice.lineItems.reduce((m, l) => Math.max(m, l.order), -1) + 1;
  let subtotal = invoice.subtotal;
  let gst = invoice.gstAmount;
  let qst = invoice.qstAmount;
  let hst = invoice.hstAmount;
  for (const c of pending) {
    await db.invoiceLineItem.create({
      data: {
        invoiceId: invoice.id,
        description: `Supplier invoice — ${c.supplier}${c.reference ? ` #${c.reference}` : ""}`,
        details: [c.description, "Paid on your behalf, billed at cost (supplier taxes included below)."].filter(Boolean).join(" "),
        quantity: 1,
        unitPrice: c.subtotal,
        order: order++,
      },
    });
    subtotal += c.subtotal;
    gst += c.gstAmount;
    qst += c.qstAmount;
    hst += c.hstAmount;
    await db.projectSupplierInvoice.update({ where: { id: c.id }, data: { billedInvoiceId: invoice.id, reimbursementStatus: "BILLED" } });
  }
  const tax = round(gst + qst + hst);
  await db.invoice.update({
    where: { id: invoice.id },
    data: { subtotal: round(subtotal), gstAmount: round(gst), qstAmount: round(qst), hstAmount: round(hst), taxAmount: tax, totalAmount: round(subtotal + tax), amount: round(subtotal + tax) },
  });
}
