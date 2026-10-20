import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { contactTaxLocation } from "@/lib/billing-totals";
import { computeSectionedTotals } from "@/lib/proposal-sections";
import ConvertToInvoiceButton from "./convert-to-invoice-button";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-black/5 text-soft",
  APPROVED: "bg-amber-50 text-amber-700",
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
        sections: { orderBy: { order: "asc" } },
        invoices: true,
      },
    });
    return { project, proposal };
  });

  if (!project || !proposal || proposal.projectId !== id) notFound();

  const sectioned = proposal.layout === "SECTIONED";
  const money = (n: number) => `${n.toFixed(2)} ${proposal.currency}`;
  const sectionRows = proposal.sections.map((sec) => ({
    sec,
    lineItems: proposal.lineItems.filter((li) => li.sectionId === sec.id),
    instalments: proposal.paymentSchedule.filter((row) => row.sectionId === sec.id),
  }));
  const sectionTotals = sectioned
    ? await withScopedPrismaClient(async (db) => {
        const billing = await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
        return computeSectionedTotals(
          sectionRows.map((r) => ({ lineItems: r.lineItems, instalments: r.instalments })),
          contactTaxLocation(project.contact),
          billing.chargeCanadianTax
        );
      })
    : null;
  let instalmentNo = 0;

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

      {sectioned && sectionTotals && (
        <>
          {sectionRows.map(({ sec, lineItems, instalments }, si) => {
            const st = sectionTotals.sections[si];
            return (
              <section key={sec.id} className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
                <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
                <h2 className="font-display text-lg font-semibold text-ink">{sec.title}</h2>
                {lineItems.length > 0 ? (
                  <table className="mt-3 w-full text-sm">
                    <tbody className="divide-y divide-card-border">
                      {lineItems.map((li) => (
                        <tr key={li.id}>
                          <td className="py-2 text-ink">{li.description}</td>
                          <td className="py-2 text-right text-soft">{li.quantity}</td>
                          <td className="py-2 text-right text-soft">{money(li.unitPrice)}</td>
                          <td className="py-2 text-right font-medium text-ink">{money(li.quantity * li.unitPrice)}</td>
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
                    <span className="text-ink">{money(st.subtotal)}</span>
                  </div>
                  {st.gst > 0 && (
                    <div className="flex justify-between">
                      <span className="text-soft">{t.proposals.gst}</span>
                      <span className="text-ink">{money(st.gst)}</span>
                    </div>
                  )}
                  {st.qst > 0 && (
                    <div className="flex justify-between">
                      <span className="text-soft">{t.proposals.qst}</span>
                      <span className="text-ink">{money(st.qst)}</span>
                    </div>
                  )}
                  {st.hst > 0 && (
                    <div className="flex justify-between">
                      <span className="text-soft">{t.proposals.hst}</span>
                      <span className="text-ink">{money(st.hst)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-card-border pt-1 font-semibold">
                    <span className="text-ink">{t.proposals.sectionTotal}</span>
                    <span className="text-ink">{money(st.totalAmount)}</span>
                  </div>
                </div>
                {instalments.length > 0 && (
                  <>
                    <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-soft">{t.proposals.instalmentsTitle}</h3>
                    <ul className="mt-1 divide-y divide-card-border text-sm">
                      {instalments.map((row, i) => (
                        <li key={row.id} className="flex items-center justify-between py-2">
                          <span className="text-ink">{row.label}</span>
                          <span className="text-soft">
                            {row.percentage != null && `${row.percentage}% · `}
                            {money(st.instalmentAmounts[i])}
                            {row.dueDate && ` · ${format(row.dueDate, "MMMM d, yyyy", { locale: dateLocale })}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            );
          })}

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.proposals.summaryTitle}</h2>
            <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-soft">{t.proposals.summaryCostsBySection}</h3>
            <ul className="mt-1 divide-y divide-card-border text-sm">
              {sectionRows.map(({ sec }, si) => (
                <li key={sec.id} className="flex justify-between py-2">
                  <span className="text-ink">{sec.title}</span>
                  <span className="text-ink">{money(sectionTotals.sections[si].totalAmount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-soft">{t.proposals.subtotal}</span>
                <span className="text-ink">{money(sectionTotals.grand.subtotal)}</span>
              </div>
              {sectionTotals.grand.gst > 0 && (
                <div className="flex justify-between">
                  <span className="text-soft">{t.proposals.gst}</span>
                  <span className="text-ink">{money(sectionTotals.grand.gst)}</span>
                </div>
              )}
              {sectionTotals.grand.qst > 0 && (
                <div className="flex justify-between">
                  <span className="text-soft">{t.proposals.qst}</span>
                  <span className="text-ink">{money(sectionTotals.grand.qst)}</span>
                </div>
              )}
              {sectionTotals.grand.hst > 0 && (
                <div className="flex justify-between">
                  <span className="text-soft">{t.proposals.hst}</span>
                  <span className="text-ink">{money(sectionTotals.grand.hst)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-card-border pt-1 font-semibold">
                <span className="text-ink">{t.proposals.totalDue}</span>
                <span className="text-ink">{money(sectionTotals.grand.totalAmount)}</span>
              </div>
            </div>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-soft">{t.proposals.summaryAllInstalments}</h3>
            <ul className="mt-1 divide-y divide-card-border text-sm">
              {sectionRows.flatMap(({ sec, instalments }, si) =>
                instalments.map((row, i) => (
                  <li key={row.id} className="flex items-center justify-between py-2">
                    <span className="text-ink">
                      {t.proposals.instalmentNumber} {++instalmentNo} — {sec.title}: {row.label}
                    </span>
                    <span className="text-soft">
                      {money(sectionTotals.sections[si].instalmentAmounts[i])}
                      {row.dueDate && ` · ${format(row.dueDate, "MMMM d, yyyy", { locale: dateLocale })}`}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </>
      )}

      {!sectioned && (
        <>
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

        </>
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
