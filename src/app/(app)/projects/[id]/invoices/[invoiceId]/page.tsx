import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { withScopedPrismaClient } from "@/lib/prisma";
import { buildReminderDraft } from "@/lib/invoice-reminders";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import MarkPaidButton from "./mark-paid-button";
import SendReminderButton from "./send-reminder-button";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-black/5 text-soft",
  SENT: "bg-sky-50 text-sky-700",
  PAID: "bg-[#0fa38a]/10 text-[#0fa38a]",
  OVERDUE: "bg-red-50 text-red-600",
  CANCELED: "bg-black/5 text-soft",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id, invoiceId } = await params;
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  const { project, invoice } = await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id }, include: { contact: true } });
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: { lineItems: { orderBy: { order: "asc" } } },
    });
    return { project, invoice };
  });

  if (!project || !invoice || invoice.projectId !== id) notFound();

  // A reminder is a mailto: draft (see buildReminderDraft's comment) — a
  // contact with no email on file (e.g. a personal Google Contacts import,
  // see google-contacts.ts) has nowhere for it to go.
  const reminderDraft =
    invoice.status === "OVERDUE" && project.contact.email
      ? buildReminderDraft(invoice, { email: project.contact.email, firstName: project.contact.firstName })
      : null;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={`/projects/${project.id}`} className="text-sm text-soft hover:underline">
        ← {t.invoices.backToProject}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-soft">
            <Link href={`/contacts/${project.contact.id}`} className="hover:underline">
              {[project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") || project.contact.email}
            </Link>
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">
            {invoice.number ? `${t.invoices.number} ${invoice.number}` : t.invoices.title}
          </h1>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[invoice.status]}`}>
            {t.invoices.statuses[invoice.status]}
          </span>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/projects/${project.id}/invoices/${invoice.id}/edit`}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
          >
            {t.taskDetail.edit}
          </Link>
          {invoice.status !== "PAID" && invoice.status !== "CANCELED" && (
            <MarkPaidButton invoiceId={invoice.id} projectId={project.id} lang={lang} />
          )}
        </div>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">{t.invoices.lineItemsTitle}</h2>
        {invoice.lineItems.length > 0 ? (
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-card-border">
              {invoice.lineItems.map((li) => (
                <tr key={li.id}>
                  <td className="py-2 text-ink">{li.description}</td>
                  <td className="py-2 text-right text-soft">{li.quantity}</td>
                  <td className="py-2 text-right text-soft">
                    {li.unitPrice.toFixed(2)} {invoice.currency}
                  </td>
                  <td className="py-2 text-right font-medium text-ink">
                    {(li.quantity * li.unitPrice).toFixed(2)} {invoice.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-soft">{t.invoices.noLineItems}</p>
        )}

        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-soft">{t.invoices.subtotal}</span>
            <span className="text-ink">
              {invoice.subtotal.toFixed(2)} {invoice.currency}
            </span>
          </div>
          {invoice.gstAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.invoices.gst}</span>
              <span className="text-ink">
                {invoice.gstAmount.toFixed(2)} {invoice.currency}
              </span>
            </div>
          )}
          {invoice.qstAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.invoices.qst}</span>
              <span className="text-ink">
                {invoice.qstAmount.toFixed(2)} {invoice.currency}
              </span>
            </div>
          )}
          {invoice.hstAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.invoices.hst}</span>
              <span className="text-ink">
                {invoice.hstAmount.toFixed(2)} {invoice.currency}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-card-border pt-1 font-semibold">
            <span className="text-ink">{t.invoices.totalDue}</span>
            <span className="text-ink">
              {invoice.totalAmount.toFixed(2)} {invoice.currency}
            </span>
          </div>
        </div>

        {invoice.dueDate && (
          <p className="mt-3 text-xs text-soft">
            {t.invoices.dueDate}: {format(invoice.dueDate, "MMMM d, yyyy", { locale: dateLocale })}
          </p>
        )}
      </section>

      {reminderDraft && (
        <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <h2 className="font-display text-lg font-semibold text-ink">{t.invoices.remindersTitle}</h2>
          <p className="mt-2 text-sm text-ink">
            {project.contact.autoSendInvoiceReminders ? t.invoices.reminderDraftAuto : t.invoices.reminderDraftManual}
          </p>
          <div className="mt-3 rounded-lg border border-card-border bg-field-bg p-3 text-sm">
            <p className="font-medium text-ink">{reminderDraft.subject}</p>
            <p className="mt-1 whitespace-pre-wrap text-soft">{reminderDraft.body}</p>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <SendReminderButton invoiceId={invoice.id} mailtoHref={reminderDraft.mailtoHref} lang={lang} />
            {invoice.lastReminderAt && (
              <span className="text-xs text-soft">
                {t.invoices.lastReminderSent(format(invoice.lastReminderAt, "MMMM d, yyyy", { locale: dateLocale }))}
              </span>
            )}
          </div>
        </section>
      )}

      {invoice.notes && (
        <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <h2 className="font-display text-lg font-semibold text-ink">{t.proposals.notes}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{invoice.notes}</p>
        </section>
      )}
    </div>
  );
}
