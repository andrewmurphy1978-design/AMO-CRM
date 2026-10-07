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

const attachedSelect = { id: true, name: true, mimeType: true, size: true, note: true, createdAt: true, uploadedByName: true, kind: true } as const;
const toRow = (f: { id: string; name: string; mimeType: string; size: number; note: string | null; createdAt: Date; uploadedByName: string | null; kind: string | null }, from?: FileRow["from"]): FileRow => ({
  id: f.id,
  name: f.name,
  mimeType: f.mimeType,
  size: f.size,
  note: f.note,
  uploadedByName: f.uploadedByName,
  createdAt: f.createdAt.toISOString(),
  kind: f.kind === "BRAND_REPORT" ? "Brand report" : f.kind === "BRAND_PDF" ? "Brand guide (PDF)" : f.kind === "RESEARCH_REPORT" ? "Research report" : f.kind === "RESEARCH_PDF" ? "Research report (PDF)" : f.kind === "MOCKUP_REPORT" ? "Mock-up report" : f.kind === "MOCKUP_PDF" ? "Mock-up report (PDF)" : f.uploadedByName === "Stripe" ? "Payment confirmation" : undefined,
  from,
});

const byDate = (a: FileRow, b: FileRow) => b.createdAt.localeCompare(a.createdAt);

export async function loadProjectFileRows(db: PrismaClient, project: { id: string; name: string }): Promise<FileRow[]> {
  const own = await db.attachedFile.findMany({ where: { projectId: project.id, OR: [{ kind: null }, { kind: { notIn: ["RESEARCH_SHOT", "MOCKUP_SHOT"] } }] }, orderBy: { createdAt: "desc" }, select: attachedSelect });
  // The client's brand report and PDF guide (kept on the Brand card) belong with the project's files too.
  const owner = await db.project.findUnique({ where: { id: project.id }, select: { contactId: true } });
  const brand = owner ? await db.attachedFile.findMany({ where: { contactId: owner.contactId, kind: { in: ["BRAND_REPORT", "BRAND_PDF"] } }, orderBy: { createdAt: "desc" }, select: attachedSelect }) : [];
  const brandFrom = owner ? { label: "Brand", href: `/contacts/${owner.contactId}` } : undefined;
  return [...own.map((f) => toRow(f)), ...brand.map((f) => toRow(f, brandFrom)), ...(await projectDocuments(db, project))].sort(byDate);
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

// The AI brand reports dropped on a client's Brand card.
export async function loadBrandReports(db: PrismaClient, contactId: string): Promise<FileRow[]> {
  const rows = await db.attachedFile.findMany({ where: { contactId, kind: { in: ["BRAND_REPORT", "BRAND_PDF"] } }, orderBy: { createdAt: "desc" }, select: attachedSelect });
  return rows.map((f) => toRow(f));
}

// The Research card: the AI research reports, their screenshots and the final PDFs.
export async function loadResearchCard(db: PrismaClient, projectId: string): Promise<{ reports: FileRow[]; shots: { id: string; name: string }[]; pdfs: FileRow[] }> {
  const rows = await db.attachedFile.findMany({ where: { projectId, kind: { in: ["RESEARCH_REPORT", "RESEARCH_SHOT", "RESEARCH_PDF"] } }, orderBy: { createdAt: "asc" }, select: attachedSelect });
  return {
    reports: rows.filter((r) => r.kind === "RESEARCH_REPORT").map((r) => toRow(r)),
    shots: rows.filter((r) => r.kind === "RESEARCH_SHOT").map((r) => ({ id: r.id, name: r.name })),
    pdfs: rows.filter((r) => r.kind === "RESEARCH_PDF").map((r) => toRow(r)),
  };
}

// The Mock-ups card: the AI mock-up reports and the images of their zip.
export async function loadMockupCard(db: PrismaClient, projectId: string): Promise<{ reports: FileRow[]; shots: { id: string; name: string }[]; pdfs: FileRow[] }> {
  const rows = await db.attachedFile.findMany({ where: { projectId, kind: { in: ["MOCKUP_REPORT", "MOCKUP_SHOT", "MOCKUP_PDF"] } }, orderBy: { createdAt: "asc" }, select: attachedSelect });
  return {
    reports: rows.filter((r) => r.kind === "MOCKUP_REPORT").map((r) => toRow(r)),
    shots: rows.filter((r) => r.kind === "MOCKUP_SHOT").map((r) => ({ id: r.id, name: r.name })),
    pdfs: rows.filter((r) => r.kind === "MOCKUP_PDF").map((r) => toRow(r)),
  };
}
