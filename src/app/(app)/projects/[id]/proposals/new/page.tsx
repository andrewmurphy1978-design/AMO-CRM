import Link from "next/link";
import { notFound } from "next/navigation";
import { withScopedPrismaClient } from "@/lib/prisma";
import { createFullProposal } from "@/actions/proposals";
import { contactTaxLocation } from "@/lib/billing-totals";
import ProposalForm from "../proposal-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function NewProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lang = await getLang();
  const t = getDict(lang);

  const { project, catalog, billingSettings } = await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id }, include: { contact: true } });
    const catalog = await db.servicePriceListItem.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    const billingSettings = await db.billingSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    return { project, catalog, billingSettings };
  });

  if (!project) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/projects/${project.id}`} className="text-sm text-soft hover:underline">
        ← {t.proposals.backToProject}
      </Link>
      <h1 className="font-display text-2xl font-semibold text-ink">{t.proposals.newFullTitle}</h1>
      <div className="rounded-lg border border-card-border bg-card-bg p-6 shadow-sm">
        <ProposalForm
          action={createFullProposal}
          projectId={project.id}
          catalog={catalog}
          taxLocation={contactTaxLocation(project.contact)}
          chargeCanadianTax={billingSettings.chargeCanadianTax}
          submitLabel={t.proposals.createFullProposal}
          lang={lang}
        />
      </div>
    </div>
  );
}
