import { headers } from "next/headers";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getStripeConfig, verifyPayLink } from "@/lib/stripe";
import PayButton from "./pay-button";

export const dynamic = "force-dynamic";

// The client's payment page for one invoice (an instalment, usually): public, reached from the signed
// link in the invoice email. It shows what is being paid and sends the client to Stripe's secure checkout.
export default async function PayPage({ params, searchParams }: { params: Promise<{ invoiceId: string }>; searchParams: Promise<{ exp?: string; sig?: string; paid?: string }> }) {
  const { invoiceId } = await params;
  const { exp = "", sig = "", paid } = await searchParams;
  await headers();
  const valid = await verifyPayLink(invoiceId, exp, sig);

  const data = valid
    ? await withScopedPrismaClient(async (db) => {
        const invoice = await db.invoice.findUnique({
          where: { id: invoiceId },
          include: { lineItems: { orderBy: { order: "asc" } }, project: { include: { contact: true } }, instalment: { include: { proposal: { include: { paymentSchedule: { orderBy: { order: "asc" } } } } } } },
        });
        if (!invoice) return null;
        const settings = await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
        return { invoice, settings, stripe: Boolean(await getStripeConfig(db)) };
      })
    : null;

  const fr = (data?.invoice.project.contact.locale ?? "").toLowerCase().startsWith("fr");
  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-[#f4f6f3] px-4 py-8">
      <div className="mx-auto max-w-lg overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="bg-[#0f2a1d] px-6 py-5 text-white">
          <p className="font-semibold">Andrew Murphy Online</p>
          <p className="text-xs opacity-80">{fr ? "Paiement sécurisé" : "Secure payment"}</p>
        </div>
        <div className="space-y-4 p-6">{children}</div>
      </div>
    </main>
  );

  if (!data) return shell(<p className="text-sm text-gray-700">{valid ? (fr ? "Facture introuvable." : "Invoice not found.") : fr ? "Ce lien de paiement n'est pas valide ou a expiré. Écrivez-nous pour en recevoir un nouveau." : "This payment link isn't valid or has expired. Please contact us for a new one."}</p>);

  const { invoice, stripe } = data;
  const total = invoice.totalAmount || invoice.amount;
  const money = new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: invoice.currency }).format(total);
  const rows = invoice.instalment?.proposal.paymentSchedule ?? [];
  const idx = rows.findIndex((r) => r.id === invoice.instalmentId);
  const instalment = invoice.instalment ? `${fr ? "Versement" : "Instalment"} ${idx + 1} ${fr ? "de" : "of"} ${rows.length} — ${invoice.instalment.label}` : null;
  const isPaid = invoice.status === "PAID";

  return shell(
    <>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{fr ? "Facture" : "Invoice"}</p>
        <p className="text-lg font-semibold text-gray-900">{invoice.number || "—"}</p>
        <p className="text-sm text-gray-600">{invoice.project.name}</p>
        {instalment && <p className="mt-1 text-sm font-medium text-[#0f2a1d]">{instalment}</p>}
      </div>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 text-sm">
        {invoice.lineItems.map((li) => (
          <li key={li.id} className="flex justify-between gap-3 px-3 py-2">
            <span className="text-gray-700">{li.description}</span>
            <span className="shrink-0 text-gray-900">{new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: invoice.currency }).format(li.quantity * li.unitPrice)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-gray-200 pt-3">
        <span className="text-sm font-semibold text-gray-700">{fr ? "Montant à payer (taxes incluses)" : "Amount due (taxes included)"}</span>
        <span className="text-2xl font-bold text-gray-900">{money}</span>
      </div>
      {isPaid || paid ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {isPaid ? (fr ? "Cette facture est payée. Merci!" : "This invoice is paid. Thank you!") : fr ? "Merci! Votre paiement a été reçu; la confirmation peut prendre quelques secondes." : "Thank you! Your payment was received; the confirmation can take a few seconds."}
        </p>
      ) : invoice.status === "DRAFT" || invoice.status === "CANCELED" ? (
        <p className="text-sm text-gray-600">{fr ? "Cette facture n'est pas encore prête pour le paiement." : "This invoice isn't ready for payment yet."}</p>
      ) : stripe ? (
        <>
          <PayButton invoiceId={invoiceId} exp={exp} sig={sig} fr={fr} label={fr ? `Payer ${money} par carte` : `Pay ${money} by card`} />
          <p className="text-center text-xs text-gray-500">{fr ? "Paiement sécurisé par Stripe. Carte de crédit, Apple Pay ou Google Pay." : "Secure payment by Stripe. Credit card, Apple Pay or Google Pay."}</p>
        </>
      ) : (
        <p className="text-sm text-gray-600">{fr ? "Le paiement en ligne n'est pas disponible. Utilisez le mode de paiement indiqué sur la facture." : "Online payment isn't available. Please use the payment method on your invoice."}</p>
      )}
    </>
  );
}
