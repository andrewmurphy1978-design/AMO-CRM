import type { PrismaClient } from "@/lib/prisma";
import { loadInvoicePdfData } from "@/lib/document-data";
import { buildInvoicePdf } from "@/lib/proposal-pdf";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export interface InvoiceEmail {
  error?: string;
  subject?: string;
  html?: string;
  to?: string | null;
  attachment?: { filename: string; mimeType: string; base64: string };
}

// The email for an invoice: the invoice PDF attached, in the client's language.
// A paid invoice reads as a receipt ("thank you for your payment"); an unpaid one
// says how to pay (Interac e-Transfer and/or the card payment page).
export async function buildInvoiceEmail(db: PrismaClient, invoiceId: string, projectId: string): Promise<InvoiceEmail> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { project: { include: { contact: true } } } });
  if (!invoice || invoice.projectId !== projectId) return { error: "Invoice not found." };
  const pdfData = await loadInvoicePdfData(db, projectId, invoiceId);
  if (!pdfData) return { error: "Couldn't build the invoice PDF." };
  const pdf = await buildInvoicePdf(pdfData.data);
  const settings = await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });

  const c = invoice.project.contact;
  const rc = invoice.recipientContactId && invoice.recipientContactId !== c.id ? await db.contact.findUnique({ where: { id: invoice.recipientContactId } }) : null;
  const fr = (c.locale ?? "").toLowerCase().startsWith("fr");
  const first = esc((rc ?? c).firstName || "");
  const project = esc(invoice.project.name);
  const paid = invoice.status === "PAID";
  const money = new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: invoice.currency }).format(invoice.totalAmount);
  const due = invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null;

  const methods: string[] = [];
  if (settings.interacEmail) methods.push(fr ? `Virement Interac à <strong>${esc(settings.interacEmail)}</strong>` : `Interac e-Transfer to <strong>${esc(settings.interacEmail)}</strong>`);
  if (settings.cardPaymentUrl) methods.push(fr ? `Carte de crédit : <a href="${esc(settings.cardPaymentUrl)}">payer en ligne</a>` : `Credit card: <a href="${esc(settings.cardPaymentUrl)}">pay online</a>`);

  const subject = `${fr ? "Facture" : "Invoice"} ${invoice.number ?? ""} — ${invoice.project.name}${paid ? (fr ? " (payée)" : " (paid)") : ""}`.replace(/\s{2,}/g, " ");
  let html: string;
  if (paid) {
    html = fr
      ? `<p>Bonjour ${first},</p><p>Merci! Nous avons bien reçu votre paiement de <strong>${money}</strong> pour <strong>${project}</strong>. Vous trouverez votre facture acquittée en pièce jointe.</p><p>Au plaisir de poursuivre le projet avec vous!</p>`
      : `<p>Hi ${first},</p><p>Thank you! We received your payment of <strong>${money}</strong> for <strong>${project}</strong>. Your paid invoice is attached.</p><p>Looking forward to moving the project forward with you!</p>`;
  } else {
    const how = methods.length > 0 ? (fr ? `<p>Vous pouvez payer par :</p><ul>${methods.map((m) => `<li>${m}</li>`).join("")}</ul>` : `<p>You can pay by:</p><ul>${methods.map((m) => `<li>${m}</li>`).join("")}</ul>`) : "";
    html = fr
      ? `<p>Bonjour ${first},</p><p>Voici votre facture de <strong>${money}</strong> pour <strong>${project}</strong> (en pièce jointe), payable ${due ? `le ${due}` : "à réception"}.</p>${how}<p>Merci!</p>`
      : `<p>Hi ${first},</p><p>Here is your invoice for <strong>${money}</strong> for <strong>${project}</strong> (attached), due ${due ? `on ${due}` : "on receipt"}.</p>${how}<p>Thank you!</p>`;
  }
  return { subject, html, to: invoice.recipientEmail || (rc ? rc.email || rc.email2 || rc.extraEmails[0] : null) || c.billingEmail || c.email || c.email2 || c.extraEmails[0] || null, attachment: { filename: pdfData.fileName, mimeType: "application/pdf", base64: toBase64(pdf) } };
}
