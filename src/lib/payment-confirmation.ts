import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PrismaClient } from "@/lib/prisma";
import type { StripeConfig } from "@/lib/stripe";

// When a client pays by card, the confirmation received from Stripe (what was paid, when, Stripe's
// payment reference and receipt link) is kept as a PDF in the project's Files card.
interface CheckoutObject {
  id?: string;
  amount_total?: number;
  currency?: string;
  payment_intent?: string;
  created?: number;
  customer_details?: { email?: string | null; name?: string | null };
}

const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => ({ é: "e", è: "e", ê: "e", à: "a", â: "a", ç: "c", ô: "o", î: "i", û: "u", ù: "u", ï: "i", ë: "e", É: "E", "’": "'", "—": "-", "–": "-", "«": '"', "»": '"' }[c] ?? "?"));

export async function recordStripeConfirmation(db: PrismaClient, config: StripeConfig, invoiceId: string, session: CheckoutObject): Promise<void> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { number: true, projectId: true, totalAmount: true, amount: true, currency: true, project: { select: { name: true, contactId: true } } } });
  if (!invoice) return;
  const fileName = `Payment-confirmation-${(invoice.number ?? invoiceId).replace(/[^\w.-]+/g, "-")}.pdf`;
  if (await db.attachedFile.findFirst({ where: { projectId: invoice.projectId, name: fileName }, select: { id: true } })) return;

  // Card details and Stripe's own receipt link, when the payment can be looked up.
  let receiptUrl = "";
  let card = "";
  let reference = session.payment_intent ?? session.id ?? "";
  if (session.payment_intent) {
    try {
      const res = await fetch(`https://api.stripe.com/v1/payment_intents/${session.payment_intent}?expand[]=latest_charge`, { headers: { Authorization: `Bearer ${config.secretKey}` }, signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const pi = (await res.json()) as { id?: string; latest_charge?: { receipt_url?: string; payment_method_details?: { card?: { brand?: string; last4?: string } } } };
        receiptUrl = pi.latest_charge?.receipt_url ?? "";
        const c = pi.latest_charge?.payment_method_details?.card;
        if (c?.last4) card = `${(c.brand ?? "card").toUpperCase()} ending ${c.last4}`;
        reference = pi.id ?? reference;
      }
    } catch {
      /* the confirmation is still saved without these details */
    }
  }

  const currency = (session.currency ?? invoice.currency ?? "CAD").toUpperCase();
  const amount = session.amount_total != null ? session.amount_total / 100 : invoice.totalAmount || invoice.amount || 0;
  const paidAt = session.created ? new Date(session.created * 1000) : new Date();

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.06, 0.16, 0.11);
  page.drawRectangle({ x: 0, y: 842 - 90, width: 595, height: 90, color: green });
  page.drawText("Andrew Murphy Online", { x: 40, y: 842 - 45, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Payment confirmation", { x: 40, y: 842 - 68, size: 11, font: regular, color: rgb(0.8, 0.9, 0.85) });
  const rows: [string, string][] = [
    ["Invoice", invoice.number ?? "-"],
    ["Project", invoice.project.name],
    ["Amount paid", `${amount.toFixed(2)} ${currency}`],
    ["Paid on", paidAt.toISOString().slice(0, 16).replace("T", " ") + " UTC"],
    ["Payment method", card ? `Card - ${card}` : "Card (Stripe)"],
    ["Stripe reference", reference],
    ...(session.customer_details?.email ? ([["Paid by", session.customer_details.email]] as [string, string][]) : []),
  ];
  let y = 842 - 140;
  for (const [k, v] of rows) {
    page.drawText(ascii(k), { x: 40, y, size: 10, font: bold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(ascii(v).slice(0, 70), { x: 170, y, size: 11, font: regular, color: rgb(0.1, 0.1, 0.1) });
    y -= 24;
  }
  if (receiptUrl) {
    y -= 10;
    page.drawText("Stripe receipt:", { x: 40, y, size: 10, font: bold, color: rgb(0.4, 0.4, 0.4) });
    for (let i = 0; i < receiptUrl.length; i += 80) {
      y -= 12;
      page.drawText(receiptUrl.slice(i, i + 80), { x: 40, y, size: 7, font: regular, color: rgb(0.3, 0.3, 0.3) });
    }
  }
  page.drawText("This confirmation was recorded automatically when Stripe reported the payment.", { x: 40, y: 50, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) });
  const bytes = await doc.save();

  await db.attachedFile.create({
    data: {
      projectId: invoice.projectId,
      name: fileName,
      mimeType: "application/pdf",
      size: bytes.length,
      data: bytes as never,
      note: `Payment confirmation received from Stripe${receiptUrl ? ` - receipt: ${receiptUrl}` : ""}`,
      uploadedByName: "Stripe",
    },
  });
}
