import type { PrismaClient } from "@/lib/prisma";
import type { FileRow } from "@/components/files-card";

// What the File card lists: the files uploaded to the Contact / Project, plus the documents the CRM
// already holds for the project: proposal PDFs, signed proposals, invoice PDFs, supplier invoices.
// (Stripe payment confirmations are saved as ordinary uploaded files when the payment arrives.)
async function projectDocuments(db: PrismaClient, project: { id: string; name: string }, label?: { label: string; href: string }): Promise<FileRow[]> {
  const [proposals, invoices, suppliers] = await Promise.all([
    db.proposal.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, createdAt: true, signedFileName: true, signedAt: true } }),
    db.invoice.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, createdAt: true } }),
    db.projectSupplierInvoice.findMany({ where: { projectId: project.id, fileName: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true, supplier: true, reference: true, fileName: true, createdAt: true } }),
  ]);
  const rows: FileRow[] = [];
  for (const p of proposals) {
    rows.push({ id: `proposal-${p.id}`, name: `Proposal — ${p.title}.pdf`, mimeType: "application/pdf", size: 0, note: null, createdAt: p.createdAt.toISOString(), uploadedByName: null, kind: "Proposal", href: `/api/projects/${project.id}/proposals/${p.id}/pdf`, from: label });
    if (p.signedFileName) {
      rows.push({ id: `signed-${p.id}`, name: `Signed proposal — ${p.signedFileName}`, mimeType: "application/pdf", size: 0, note: null, createdAt: (p.signedAt ?? p.createdAt).toISOString(), uploadedByName: null, kind: "Signed proposal", href: `/api/projects/${project.id}/proposals/${p.id}/signed`, from: label });
    }
  }
  for (const i of invoices) {
    rows.push({ id: `invoice-${i.id}`, name: `Invoice ${i.number ?? "(draft)"}.pdf`, mimeType: "application/pdf", size: 0, note: i.status === "PAID" ? "Paid" : null, createdAt: i.createdAt.toISOString(), uploadedByName: null, kind: "Invoice", href: `/api/projects/${project.id}/invoices/${i.id}/pdf`, from: label });
  }
  for (const s of suppliers) {
    rows.push({ id: `supplier-${s.id}`, name: `${s.supplier}${s.reference ? ` #${s.reference}` : ""} — ${s.fileName}`, mimeType: "application/pdf", size: 0, note: null, createdAt: s.createdAt.toISOString(), uploadedByName: null, kind: "Supplier invoice", href: `/api/projects/${project.id}/supplier-invoices/${s.id}/file`, from: label });
  }
  return rows;
}

const attachedSelect = { id: true, name: true, mimeType: true, size: true, note: true, createdAt: true, uploadedByName: true } as const;
const toRow = (f: { id: string; name: string; mimeType: string; size: number; note: string | null; createdAt: Date; uploadedByName: string | null }, from?: FileRow["from"]): FileRow => ({
  ...f,
  createdAt: f.createdAt.toISOString(),
  kind: f.uploadedByName === "Stripe" ? "Payment confirmation" : undefined,
  from,
});

const byDate = (a: FileRow, b: FileRow) => b.createdAt.localeCompare(a.createdAt);

export async function loadProjectFileRows(db: PrismaClient, project: { id: string; name: string }): Promise<FileRow[]> {
  const own = await db.attachedFile.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, select: attachedSelect });
  return [...own.map((f) => toRow(f)), ...(await projectDocuments(db, project))].sort(byDate);
}

// The contact's own files plus everything from its projects (each tagged with its project).
export async function loadContactFileRows(db: PrismaClient, contactId: string): Promise<FileRow[]> {
  const [own, projects] = await Promise.all([
    db.attachedFile.findMany({ where: { contactId }, orderBy: { createdAt: "desc" }, select: attachedSelect }),
    db.project.findMany({ where: { contactId }, select: { id: true, name: true } }),
  ]);
  const rows: FileRow[] = own.map((f) => toRow(f));
  for (const p of projects) {
    const label = { label: p.name, href: `/projects/${p.id}` };
    const files = await db.attachedFile.findMany({ where: { projectId: p.id }, orderBy: { createdAt: "desc" }, select: attachedSelect });
    rows.push(...files.map((f) => toRow(f, label)), ...(await projectDocuments(db, p, label)));
  }
  return rows.sort(byDate);
}
