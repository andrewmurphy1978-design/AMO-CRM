"use server";

import { withScopedPrismaClient } from "@/lib/prisma";
import { createCheckoutSession, getStripeConfig, payLinkFor, verifyPayLink } from "@/lib/stripe";
import { publicBaseUrl } from "@/lib/twilio";
import { auth } from "@/lib/auth";

// The public pay page's button: opens a Stripe Checkout for this invoice. Authorised by the signed
// link (no login), and the amount always comes from the invoice, never from the browser.
export async function startCheckout(invoiceId: string, exp: string, sig: string, origin: string): Promise<{ url?: string; error?: string }> {
  if (!(await verifyPayLink(invoiceId, exp, sig))) return { error: "This payment link is not valid." };
  return withScopedPrismaClient(async (db) => {
    const config = await getStripeConfig(db);
    if (!config) return { error: "Online payment isn't set up yet." };
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { project: { include: { contact: true } } } });
    if (!invoice) return { error: "Invoice not found." };
    if (invoice.status === "PAID") return { error: "This invoice is already paid." };
    if (invoice.status === "DRAFT" || invoice.status === "CANCELED") return { error: "This invoice isn't ready for payment." };
    const amount = invoice.totalAmount || invoice.amount;
    if (!(amount > 0)) return { error: "Nothing to pay on this invoice." };
    const base = publicBaseUrl(origin) ?? origin;
    const back = `${base}/pay/${invoiceId}?exp=${exp}&sig=${sig}`;
    const c = invoice.project.contact;
    const fr = (c.locale ?? "").toLowerCase().startsWith("fr");
    const label = `${fr ? "Facture" : "Invoice"} ${invoice.number ?? ""} — ${invoice.project.name}`.replace(/\s{2,}/g, " ");
    const res = await createCheckoutSession(config, {
      invoiceId,
      description: label,
      amount,
      currency: invoice.currency,
      email: invoice.recipientEmail || c.email,
      successUrl: `${back}&paid=1`,
      cancelUrl: back,
      locale: fr ? "fr" : "en",
    });
    return "error" in res ? { error: res.error } : { url: res.url };
  });
}

// For the team: the invoice's payment link (to paste into a message, or copy).
export async function getInvoicePayLink(invoiceId: string, origin: string): Promise<{ link?: string; error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  return withScopedPrismaClient(async (db) => {
    if (!(await getStripeConfig(db))) return { error: "Connect Stripe in Settings first." };
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } });
    if (!invoice) return { error: "Invoice not found." };
    return { link: await payLinkFor(publicBaseUrl(origin) ?? origin, invoiceId) };
  });
}
