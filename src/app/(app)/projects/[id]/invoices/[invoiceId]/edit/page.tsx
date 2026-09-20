import Link from "next/link";
import { notFound } from "next/navigation";
import { withScopedPrismaClient } from "@/lib/prisma";
import { updateInvoiceLineItems } from "@/actions/invoices";
import { contactTaxLocation } from "@/lib/billing-totals";
import InvoiceLineItemsForm from "../../invoice-line-items-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id, invoiceId } = await params;
  const lang = await getLang();
  const t = getDict(lang);

  const { project, invoice, catalog, billingSettings } = await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id }, include: { contact: true } });
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: { lineItems: { orderBy: { order: "asc" } } },
    });
    const catalog = await db.servicePriceListItem.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    const billingSettings = await db.billingSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    return { project, invoice, catalog, billingSettings };
  });

  if (!project || !invoice || invoice.projectId !== id) notFound();

  const boundUpdate = updateInvoiceLineItems.bind(null, invoice.id);

  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/projects/${project.id}/invoices/${invoice.id}`} className="text-sm text-soft hover:underline">
        ← {t.invoices.view}
      </Link>
      <h1 className="font-display text-2xl font-semibold text-ink">{t.invoices.editFullTitle}</h1>
      <div className="rounded-lg border border-card-border bg-card-bg p-6 shadow-sm">
        <InvoiceLineItemsForm
          action={boundUpdate}
          defaultValues={invoice}
          catalog={catalog}
          taxLocation={contactTaxLocation(project.contact)}
          chargeCanadianTax={billingSettings.chargeCanadianTax}
          lang={lang}
        />
      </div>
    </div>
  );
}
