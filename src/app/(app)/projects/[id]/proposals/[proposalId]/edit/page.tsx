import Link from "next/link";
import { notFound } from "next/navigation";
import { withScopedPrismaClient } from "@/lib/prisma";
import { updateFullProposal } from "@/actions/proposals";
import { contactTaxLocation } from "@/lib/billing-totals";
import ProposalForm from "../../proposal-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function EditProposalPage({
  params,
}: {
  params: Promise<{ id: string; proposalId: string }>;
}) {
  const { id, proposalId } = await params;
  const lang = await getLang();
  const t = getDict(lang);

  const { project, proposal, catalog, billingSettings } = await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id }, include: { contact: true } });
    const proposal = await db.proposal.findUnique({
      where: { id: proposalId },
      include: { lineItems: { orderBy: { order: "asc" } }, paymentSchedule: { orderBy: { order: "asc" } } },
    });
    const catalog = await db.servicePriceListItem.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    const billingSettings = await db.billingSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    return { project, proposal, catalog, billingSettings };
  });

  if (!project || !proposal || proposal.projectId !== id) notFound();

  const boundUpdate = updateFullProposal.bind(null, proposal.id);

  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/projects/${project.id}/proposals/${proposal.id}`} className="text-sm text-soft hover:underline">
        ← {t.proposals.view}
      </Link>
      <h1 className="font-display text-2xl font-semibold text-ink">{t.proposals.editFullTitle}</h1>
      <div className="rounded-lg border border-card-border bg-card-bg p-6 shadow-sm">
        <ProposalForm
          action={boundUpdate}
          projectId={project.id}
          defaultValues={proposal}
          catalog={catalog}
          taxLocation={contactTaxLocation(project.contact)}
          chargeCanadianTax={billingSettings.chargeCanadianTax}
          submitLabel={t.proposals.saveChanges}
          lang={lang}
        />
      </div>
    </div>
  );
}
