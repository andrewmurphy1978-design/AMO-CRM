import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { loadProposalPdfData } from "@/lib/document-data";
import { afterAccept } from "@/lib/proposal-after-accept";
import { getStripeConfig } from "@/lib/stripe";
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

  const { project, proposal, payment } = await withScopedPrismaClient(async (db) => {
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
    // How the client can pay (Interac / card), for the "After you accept" steps.
    const billing = await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
    const payment = { interac: Boolean(billing.interacEmail), card: Boolean(billing.cardPaymentUrl) || Boolean(await getStripeConfig(db)) };
    return { project, proposal, payment };
  });

  if (!project || !proposal || proposal.projectId !== id) notFound();

  const sectioned = proposal.layout === "SECTIONED";
  const money = (n: number) => `${n.toFixed(2)} ${proposal.currency}`;
  // The same data the PDF is built from, so the sectioned page mirrors it.
  const sd = sectioned ? ((await withScopedPrismaClient((db) => loadProposalPdfData(db, id, proposalId)))?.data ?? null) : null;
  // Shown in the proposal's own language (the client's), like the PDF it mirrors.
  const after = afterAccept((project.contact.locale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en", { sectioned, payment, validDays: 30 });
  const afterCard = (
    <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">{after.title}</h2>
      <ol className="mt-3 space-y-3">
        {after.steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#2ecc71] text-xs font-bold text-[#0d2b1a]">{i + 1}</span>
            <p className="text-sm text-ink">{step}</p>
          </li>
        ))}
      </ol>
    </section>
  );
  const sectionTexts = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

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

      {sd && (
        <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <h2 className="font-display text-lg font-semibold text-ink">{t.proposals.overviewTitle}</h2>
          <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
            <dt className="text-soft">{t.proposals.projectLabel}</dt>
            <dd className="text-ink">{sd.project.name}</dd>
            <dt className="text-soft">{(sd.project.typeLabels?.length ?? 0) > 1 ? t.proposals.typesLabel : t.proposals.typeOne}</dt>
            <dd className="text-ink">{(sd.project.typeLabels ?? [sd.project.typeLabel]).join(" · ")}</dd>
            {sd.project.startDate && (
              <>
                <dt className="text-soft">{t.proposals.startLabel}</dt>
                <dd className="text-ink">{format(sd.project.startDate, "MMMM d, yyyy", { locale: dateLocale })}</dd>
              </>
            )}
            {sd.project.dueDate && (
              <>
                <dt className="text-soft">{t.proposals.targetLabel}</dt>
                <dd className="text-ink">{format(sd.project.dueDate, "MMMM d, yyyy", { locale: dateLocale })}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {proposal.coverLetter && (
        <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <p className="whitespace-pre-wrap text-sm text-ink">{proposal.coverLetter}</p>
        </section>
      )}

      {sd && sd.sections && (
        <>
          {sd.sections.map((sec, si) => {
            const firstNo = sd.sections!.slice(0, si).reduce((n, x) => n + x.instalments.length, 0);
            const card = "relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm";
            const sub = "mt-5 border-b border-card-border pb-1 text-sm font-semibold text-ink";
            return (
              <section key={si} className={card}>
                <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
                <h2 className="font-display text-lg font-semibold text-ink">{sec.title}</h2>

                {sec.kind === "PREP" && (sec.coveredTypes?.length ?? 0) > 0 ? (
                  <>
                    <h3 className={sub}>{t.proposals.detailsTitle}</h3>
                    <p className="mt-2 text-sm text-ink">{t.proposals.prepNeeded}</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-ink">
                      {sec.coveredTypes!.map((ty) => (
                        <li key={ty}>{ty}</li>
                      ))}
                    </ul>
                  </>
                ) : (sec.details?.length ?? 0) > 0 ? (
                  <>
                    <h3 className={sub}>{t.proposals.detailsTitle}</h3>
                    <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
                      {sec.details!.map((d, i) => (
                        <div key={i} className="contents">
                          <dt className="text-soft">{d.label}</dt>
                          <dd className="whitespace-pre-wrap text-ink">{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : null}

                {(sec.plan?.length ?? 0) > 0 && (
                  <>
                    <h3 className={sub}>{t.proposals.planTitle}</h3>
                    <ol className="mt-2 space-y-3">
                      {sec.plan!.map((ph, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#2ecc71] text-xs font-bold text-[#0d2b1a]">{i + 1}</span>
                          <div>
                            <p className="text-sm font-semibold text-ink">{ph.name}</p>
                            <ul className="mt-0.5 list-disc pl-5 text-sm text-soft">
                              {ph.tasks.map((tk, j) => (
                                <li key={j}>{tk}</li>
                              ))}
                            </ul>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </>
                )}

                <h3 className={sub}>{t.proposals.investmentTitle}</h3>
                {sec.lineItems.length > 0 ? (
                  <table className="mt-2 w-full text-sm">
                    <tbody className="divide-y divide-card-border">
                      {sec.lineItems.map((li, i) => (
                        <tr key={i}>
                          <td className="py-2 text-ink">
                            {li.description}
                            {li.details && <p className="text-xs text-soft">{li.details}</p>}
                          </td>
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
                <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-soft">{t.proposals.subtotal}</span>
                    <span className="text-ink">{money(sec.subtotal)}</span>
                  </div>
                  {sec.taxes > 0 && (
                    <div className="flex justify-between">
                      <span className="text-soft">{[t.proposals.gst, t.proposals.qst, t.proposals.hst].join(" / ")}</span>
                      <span className="text-ink">{money(sec.taxes)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-card-border pt-1 font-semibold">
                    <span className="text-ink">{t.proposals.sectionTotal}</span>
                    <span className="text-ink">{money(sec.totalAmount)}</span>
                  </div>
                </div>

                {sec.instalments.length > 0 && (
                  <>
                    <h3 className={sub}>{t.proposals.instalmentsTitle}</h3>
                    <ul className="mt-1 divide-y divide-card-border text-sm">
                      {sec.instalments.map((row, i) => (
                        <li key={i} className="flex items-center justify-between py-2">
                          <span className="text-ink">
                            {firstNo + i + 1}. {row.label}
                          </span>
                          <span className="text-soft">
                            {row.percentage != null && `${row.percentage}% · `}
                            {money(row.amount)}
                            {row.dueDate && ` · ${format(row.dueDate, "MMMM d, yyyy", { locale: dateLocale })}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <h3 className={sub}>{sectionTexts(t.proposals.acceptSectionTitle, { title: sec.title })}</h3>
                <p className="mt-2 text-sm text-ink">{sectionTexts(t.proposals.acceptSectionBody, { title: sec.title, amount: money(sec.totalAmount) })}</p>
                <SignatureLines t={t} />
              </section>
            );
          })}

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.proposals.summaryTitle}</h2>
            <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-soft">{t.proposals.summaryCostsBySection}</h3>
            <ul className="mt-1 divide-y divide-card-border text-sm">
              {sd.sections.map((sec, si) => (
                <li key={si} className="flex justify-between py-2">
                  <span className="text-ink">{sec.title}</span>
                  <span className="text-ink">{money(sec.totalAmount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-soft">{t.proposals.subtotal}</span>
                <span className="text-ink">{money(sd.totals.subtotal)}</span>
              </div>
              {sd.totals.gst > 0 && (
                <div className="flex justify-between">
                  <span className="text-soft">{t.proposals.gst}</span>
                  <span className="text-ink">{money(sd.totals.gst)}</span>
                </div>
              )}
              {sd.totals.qst > 0 && (
                <div className="flex justify-between">
                  <span className="text-soft">{t.proposals.qst}</span>
                  <span className="text-ink">{money(sd.totals.qst)}</span>
                </div>
              )}
              {sd.totals.hst > 0 && (
                <div className="flex justify-between">
                  <span className="text-soft">{t.proposals.hst}</span>
                  <span className="text-ink">{money(sd.totals.hst)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-card-border pt-1 font-semibold">
                <span className="text-ink">{t.proposals.totalDue}</span>
                <span className="text-ink">{money(sd.totals.subtotal + sd.totals.total)}</span>
              </div>
            </div>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-soft">{t.proposals.summaryAllInstalments}</h3>
            <ul className="mt-1 divide-y divide-card-border text-sm">
              {sd.instalments.map((row, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span className="text-ink">
                    {t.proposals.instalmentNumber} {i + 1} — {row.label}
                  </span>
                  <span className="text-soft">
                    {money(row.amount)}
                    {row.dueDate && ` · ${format(row.dueDate, "MMMM d, yyyy", { locale: dateLocale })}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {afterCard}

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.proposals.acceptAllTitle}</h2>
            <p className="mt-2 text-sm text-ink">{t.proposals.acceptAllBody}</p>
            <SignatureLines t={t} />
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

      {afterCard}
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

function SignatureLines({ t }: { t: ReturnType<typeof getDict> }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-8 text-xs text-soft">
      <div className="border-t border-ink pt-1">{t.proposals.clientSignature}</div>
      <div className="border-t border-ink pt-1">{t.proposals.dateLabel}</div>
      <div className="mt-6 border-t border-ink pt-1">{t.proposals.printedName}</div>
    </div>
  );
}
