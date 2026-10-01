"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { billPendingSupplierCosts } from "@/lib/supplier-costs";

export const MAX_SUPPLIER_FILE_BYTES = 4_000_000;
const STATUSES = ["PENDING", "BILLED", "REIMBURSED", "ABSORBED"];

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};
const dateOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? new Date(`${s}T12:00:00Z`) : null;
};

export async function saveSupplierInvoice(
  projectId: string,
  supplierInvoiceId: string | null,
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const fr = session.user.language === "FR";

  const supplier = String(formData.get("supplier") ?? "").trim();
  if (!supplier) return { error: fr ? "Le fournisseur est requis." : "Supplier is required." };

  const subtotal = num(formData.get("subtotal"));
  const gst = num(formData.get("gstAmount"));
  const qst = num(formData.get("qstAmount"));
  const hst = num(formData.get("hstAmount"));
  const reimbursable = formData.get("reimbursable") === "on";
  const statusRaw = String(formData.get("reimbursementStatus") ?? "PENDING");
  const data = {
    supplier,
    reference: String(formData.get("reference") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    invoiceDate: dateOrNull(formData.get("invoiceDate")),
    paidDate: dateOrNull(formData.get("paidDate")),
    currency: ["CAD", "USD", "EUR", "GBP"].includes(String(formData.get("currency"))) ? String(formData.get("currency")) : "CAD",
    subtotal,
    gstAmount: gst,
    qstAmount: qst,
    hstAmount: hst,
    totalAmount: Math.round((subtotal + gst + qst + hst) * 100) / 100,
    paymentMethod: String(formData.get("paymentMethod") ?? "").trim() || null,
    reimbursable,
    reimbursementStatus: reimbursable ? (STATUSES.includes(statusRaw) ? statusRaw : "PENDING") : "ABSORBED",
    attachToProposal: formData.get("attachToProposal") === "on",
    notes: String(formData.get("notes") ?? "").trim() || null,
  };

  // The file: a newly picked one arrives as base64 (read in the browser).
  const fileBase64 = String(formData.get("fileBase64") ?? "");
  let file: { fileName: string; fileMime: string; fileData: Uint8Array } | null = null;
  if (fileBase64) {
    const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_SUPPLIER_FILE_BYTES) return { error: fr ? "Le fichier dépasse 4 Mo." : "The file is over 4 MB." };
    file = { fileName: String(formData.get("fileName") ?? "supplier-invoice").slice(0, 200), fileMime: String(formData.get("fileMime") ?? "application/octet-stream"), fileData: bytes };
  }
  const removeFile = formData.get("removeFile") === "1";

  await withScopedPrismaClient(async (db) => {
    const fileFields = file ? { fileName: file.fileName, fileMime: file.fileMime, fileData: file.fileData as never } : removeFile ? { fileName: null, fileMime: null, fileData: null as never } : {};
    if (supplierInvoiceId) {
      await db.projectSupplierInvoice.update({ where: { id: supplierInvoiceId }, data: { ...data, ...fileFields } });
    } else {
      await db.projectSupplierInvoice.create({ data: { projectId, ...data, ...fileFields } });
    }
    // Paid after the proposal went out? It rides on the next client invoice.
    await billPendingSupplierCosts(db, projectId);
  });

  revalidatePath(`/projects/${projectId}`);
  return { success: fr ? "Enregistré." : "Saved." };
}

export async function deleteSupplierInvoice(supplierInvoiceId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  await withScopedPrismaClient((db) => db.projectSupplierInvoice.delete({ where: { id: supplierInvoiceId } }));
  revalidatePath(`/projects/${projectId}`);
}
