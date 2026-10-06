import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getStripeConfig, markInvoicePaid, verifyStripeSignature } from "@/lib/stripe";
import { recordStripeConfirmation } from "@/lib/payment-confirmation";

// Stripe calls this when a client pays. Add https://<your CRM>/api/stripe/webhook in Stripe >
// Developers > Webhooks with the event "checkout.session.completed" (and
// "checkout.session.async_payment_succeeded"), then paste its signing secret in Settings > Stripe.
export async function POST(request: NextRequest) {
  const body = await request.text();
  const result = await withScopedPrismaClient(async (db) => {
    const config = await getStripeConfig(db);
    if (!config?.webhookSecret) return { status: 503 };
    if (!(await verifyStripeSignature(body, request.headers.get("stripe-signature"), config.webhookSecret))) return { status: 400 };

    let event: { type?: string; data?: { object?: { id?: string; amount_total?: number; currency?: string; payment_intent?: string; created?: number; customer_details?: { email?: string | null; name?: string | null }; payment_status?: string; metadata?: { invoiceId?: string }; client_reference_id?: string } } };
    try {
      event = JSON.parse(body);
    } catch {
      return { status: 400 };
    }
    const obj = event.data?.object;
    const invoiceId = obj?.metadata?.invoiceId ?? obj?.client_reference_id;
    const paid = event.type === "checkout.session.async_payment_succeeded" || (event.type === "checkout.session.completed" && obj?.payment_status === "paid");
    if (!paid || !invoiceId) return { status: 200 };
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { projectId: true, project: { select: { contactId: true } } } });
    if (!invoice) return { status: 200 };
    await markInvoicePaid(db, invoiceId);
    // Keep Stripe's confirmation with the project's files (never blocks the payment itself).
    await recordStripeConfirmation(db, config, invoiceId, obj ?? {}).catch((err) => console.error("stripe confirmation not saved", err));
    return { status: 200, projectId: invoice.projectId, contactId: invoice.project.contactId };
  });
  if ("projectId" in result && result.projectId) {
    revalidatePath(`/projects/${result.projectId}`);
    revalidatePath(`/contacts/${result.contactId}`);
  }
  return new NextResponse(null, { status: result.status });
}
