import Link from "next/link";
import { withScopedPrismaClient } from "@/lib/prisma";
import InvoicesIcon from "./invoices-icon";

export interface ProposalsInvoicesLabels {
  title: string;
  proposals: string;
  invoices: string;
  emptyProposals: string;
  emptyInvoices: string;
  all: string;
  due: string;
  invoiceFallback: string;
  status: Record<string, string>;
}

function money(n: number, currency: string, lang: "en" | "fr"): string {
  return n.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency });
}

function Section({ title, count, headerBg, children }: { title: string; count: number; headerBg: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-card-border">
      <div className={`flex items-center gap-2 px-3 py-2 ${headerBg}`}>
        <h3 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-white">{title}</h3>
        <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold text-white">{count}</span>
      </div>
      <div className="max-h-72 overflow-y-auto bg-card-bg px-3">{children}</div>
    </section>
  );
}

// Dashboard "Proposals & Invoices": proposals still in progress and invoices not yet paid.
export default async function ProposalsInvoicesCard({ lang, labels: t }: { lang: "en" | "fr"; labels: ProposalsInvoicesLabels }) {
  const { proposals, invoices } = await withScopedPrismaClient(async (db) => ({
    proposals: await db.proposal.findMany({
      where: { status: { in: ["DRAFT", "APPROVED", "SENT"] } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { project: { select: { name: true } } },
    }),
    invoices: await db.invoice.findMany({
      where: { status: { in: ["DRAFT", "APPROVED", "SENT", "OVERDUE"] } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 50,
      include: { project: { select: { name: true } } },
    }),
  }));
  const dateFmt = (d: Date) => d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Montreal" });

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-emerald-50/40 p-2 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-emerald-500" />
      <div className="flex items-center gap-2">
        <InvoicesIcon size="h-8 w-8" iconSize="h-5 w-5" />
        <h2 className="font-display text-lg font-semibold text-ink">{t.title}</h2>
        <Link href="/invoices" className="ml-auto text-xs font-semibold text-amo-lime hover:underline">
          {t.all} →
        </Link>
      </div>
      <div className="mt-3 space-y-3">
        <Section title={t.proposals} count={proposals.length} headerBg="bg-indigo-500">
          {proposals.length === 0 ? (
            <p className="py-3 text-sm text-soft">{t.emptyProposals}</p>
          ) : (
            <ul className="divide-y divide-card-border">
              {proposals.map((p) => (
                <li key={p.id} className="flex items-start gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/projects/${p.projectId}/proposals/${p.id}`} className="font-medium text-ink hover:underline">
                      {p.title}
                    </Link>
                    <p className="truncate text-xs text-soft">{p.project.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums text-ink">{money(p.totalAmount || p.amount || 0, p.currency, lang)}</p>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">{t.status[p.status] ?? p.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={t.invoices} count={invoices.length} headerBg="bg-emerald-500">
          {invoices.length === 0 ? (
            <p className="py-3 text-sm text-soft">{t.emptyInvoices}</p>
          ) : (
            <ul className="divide-y divide-card-border">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-start gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/projects/${inv.projectId}/invoices/${inv.id}`} className="font-medium text-ink hover:underline">
                      {inv.number ? `#${inv.number}` : t.invoiceFallback}
                    </Link>
                    <p className="truncate text-xs text-soft">
                      {inv.project.name}
                      {inv.dueDate && ` · ${t.due} ${dateFmt(inv.dueDate)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums text-ink">{money(inv.totalAmount || inv.amount, inv.currency, lang)}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${inv.status === "OVERDUE" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {t.status[inv.status] ?? inv.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
