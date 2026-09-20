import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import ConvertToInvoiceButton from "./convert-to-invoice-button";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-black/5 text-soft",
  SENT: "bg-sky-50 text-sky-700",
  ACCEPTED: "bg-[#0fa38a]/10 text-[#0fa38a]",
  DECLINED: "bg-red-50 text-red-600",
};

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string; proposalId: string }>;
}) {
  const { id, proposalId } = await params;
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  const { project, proposal } = await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id }, include: { contact: true } });
    const proposal = await db.proposal.findUnique({
      where: { id: proposalId },
      include: {
        lineItems: { orderBy: { order: "asc" } },
        paymentSchedule: { orderBy: { order: "asc" } },
        invoices: true,
      },
    });
    return { project, proposal };
  });

  if (!project || !proposal || proposal.projectId !== id) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={`/projects/${project.id}`} className="text-sm text-soft hover:underline">
        ← {t.proposals.backToProject}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-soft">
            <Link href={`/contacts/${project.contact.id}`} className="hover:underline">
              {[project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") || project.contact.email}
            </Link>
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">{proposal.title}</h1>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[proposal.status]}`}>
            {t.proposals.statuses[proposal.status]}
          </span>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/projects/${project.id}/proposals/${proposal.id}/edit`}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
          >
            {t.proposals.edit}
          </Link>
          {proposal.status === "ACCEPTED" && proposal.invoices.length === 0 && (
            <ConvertToInvoiceButton proposalId={proposal.id} projectId={project.id} lang={lang} />
          )}
        </div>
      </div>

      {proposal.coverLetter && (
        <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <p className="whitespace-pre-wrap text-sm text-ink">{proposal.coverLetter}</p>
        </section>
      )}

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">{t.proposals.lineItemsTitle}</h2>
        {proposal.lineItems.length > 0 ? (
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-card-border">
              {proposal.lineItems.map((li) => (
                <tr key={li.id}>
                  <td className="py-2 text-ink">{li.description}</td>
                  <td className="py-2 text-right text-soft">{li.quantity}</td>
                  <td className="py-2 text-right text-soft">
                    {li.unitPrice.toFixed(2)} {proposal.currency}
                  </td>
                  <td className="py-2 text-right font-medium text-ink">
                    {(li.quantity * li.unitPrice).toFixed(2)} {proposal.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-soft">{t.proposals.noLineItems}</p>
        )}

        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-soft">{t.proposals.subtotal}</span>
            <span className="text-ink">
              {proposal.subtotal.toFixed(2)} {proposal.currency}
            </span>
          </div>
          {proposal.gstAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.proposals.gst}</span>
              <span className="text-ink">
                {proposal.gstAmount.toFixed(2)} {proposal.currency}
              </span>
            </div>
          )}
          {proposal.qstAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.proposals.qst}</span>
              <span className="text-ink">
                {proposal.qstAmount.toFixed(2)} {proposal.currency}
              </span>
            </div>
          )}
          {proposal.hstAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.proposals.hst}</span>
              <span className="text-ink">
                {proposal.hstAmount.toFixed(2)} {proposal.currency}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-card-border pt-1 font-semibold">
            <span className="text-ink">{t.proposals.totalDue}</span>
            <span className="text-ink">
              {proposal.totalAmount.toFixed(2)} {proposal.currency}
            </span>
          </div>
        </div>
      </section>

      {proposal.paymentSchedule.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <h2 className="font-display text-lg font-semibold text-ink">{t.proposals.paymentScheduleTitle}</h2>
          <ul className="mt-3 divide-y divide-card-border text-sm">
            {proposal.paymentSchedule.map((row) => (
              <li key={row.id} className="flex items-center justify-between py-2">
                <span className="text-ink">{row.label}</span>
                <span className="text-soft">
                  {row.percentage != null && `${row.percentage}%`}
                  {row.amount != null && `${row.amount.toFixed(2)} ${proposal.currency}`}
                  {row.dueDate && ` · ${format(row.dueDate, "MMMM d, yyyy", { locale: dateLocale })}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {proposal.notes && (
        <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <h2 className="font-display text-lg font-semibold text-ink">{t.proposals.notes}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{proposal.notes}</p>
        </section>
      )}
    </div>
  );
}
