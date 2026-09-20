import Link from "next/link";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getHour12 } from "@/lib/time-format";
import { needsReminder } from "@/lib/invoice-reminders";
import PageHeader from "../page-header";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-black/5 text-soft",
  SENT: "bg-sky-50 text-sky-700",
  PAID: "bg-[#0fa38a]/10 text-[#0fa38a]",
  OVERDUE: "bg-red-50 text-red-600",
  CANCELED: "bg-black/5 text-soft",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const STATUS_LABELS = t.invoices.statuses;

  const where: Prisma.InvoiceWhereInput = {};
  if (status) where.status = status as Prisma.InvoiceWhereInput["status"];

  // One shared client — see src/lib/prisma.ts for why.
  const { invoices, hour12 } = await withScopedPrismaClient(async (db) => {
    const invoices = await db.invoice.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      include: { project: { include: { contact: true } } },
    });
    const hour12 = await getHour12(session, db);
    return { invoices, hour12 };
  });

  const needingReminder = invoices.filter((inv) => needsReminder(inv));

  return (
    <div className="space-y-6">
      <PageHeader title={t.invoices.title} hour12={hour12} dateLocale={dateLocale} location={t.dashboard.myLocation} />

      {needingReminder.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-red-800">{t.invoices.remindersPage}</h2>
          <ul className="mt-2 divide-y divide-red-200">
            {needingReminder.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/projects/${inv.projectId}/invoices/${inv.id}`} className="text-red-900 hover:underline">
                  {inv.number ? `#${inv.number}` : t.invoices.title} —{" "}
                  {[inv.project.contact.firstName, inv.project.contact.lastName].filter(Boolean).join(" ") ||
                    inv.project.contact.email}
                </Link>
                <span className="font-medium text-red-800">
                  {inv.totalAmount.toFixed(2)} {inv.currency}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="flex gap-3" method="get">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        >
          <option value="">{t.tasksPage.allStatuses}</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
        >
          {t.common.filter}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-card-border bg-black/[0.02] text-left text-xs uppercase tracking-wide text-soft">
            <tr>
              <th className="px-4 py-3">{t.invoices.number}</th>
              <th className="px-4 py-3">{t.projectForm.client}</th>
              <th className="px-4 py-3">{t.invoices.status}</th>
              <th className="px-4 py-3">{t.invoices.dueDate}</th>
              <th className="px-4 py-3">{t.invoices.totalDue}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {invoices.map((inv, i) => (
              <tr key={inv.id} className="group relative" style={{ backgroundColor: i % 2 === 0 ? "#f4faf6" : "#7fa898" }}>
                <td className="px-4 py-3">
                  <Link href={`/projects/${inv.projectId}/invoices/${inv.id}`} className="relative z-10 font-medium text-ink group-hover:underline">
                    <span className="absolute inset-0 z-0 group-hover:bg-black/5" aria-hidden="true" />
                    {inv.number ? `#${inv.number}` : "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {[inv.project.contact.firstName, inv.project.contact.lastName].filter(Boolean).join(" ") ||
                    inv.project.contact.email}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status]}`}>
                    {STATUS_LABELS[inv.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {inv.dueDate ? format(inv.dueDate, "MMMM d, yyyy", { locale: dateLocale }) : "—"}
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {inv.totalAmount.toFixed(2)} {inv.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && <p className="py-8 text-center text-sm text-soft">{t.invoices.noInvoicesFound}</p>}
      </div>
    </div>
  );
}
