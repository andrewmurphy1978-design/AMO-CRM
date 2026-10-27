import { withScopedPrismaClient } from "@/lib/prisma";
import { money } from "@/lib/accounting/format";
import InvoicesIcon from "./invoices-icon";
import ScrollSummaryCard from "./scroll-summary-card";
import SubCard from "./summary-sub-card";
import { PI_BUCKET_COLORS, PI_CARD_ACCENT_BAR, PI_CARD_ACCENT_DOT, PI_CARD_BG } from "./accounting-summary-colors";

export interface ProposalsInvoicesSummaryLabels {
  title: string;
  openLabel: string;
  sentLabel: string;
  unpaidLabel: string;
  overdueLabel: string;
  owedLabel: string;
}

export const PROPOSALS_INVOICES_CARD_ID = "dashboard-proposals-invoices-card";

export default async function ProposalsInvoicesSummaryCard({ lang, labels }: { lang: "en" | "fr"; labels: ProposalsInvoicesSummaryLabels }) {
  const c = await withScopedPrismaClient(async (db) => {
    const [open, sent, unpaid, overdue, owed] = await Promise.all([
      db.proposal.count({ where: { status: { in: ["DRAFT", "APPROVED", "SENT"] } } }),
      db.proposal.count({ where: { status: "SENT" } }),
      db.invoice.count({ where: { status: { in: ["DRAFT", "APPROVED", "SENT", "OVERDUE"] } } }),
      db.invoice.count({ where: { status: "OVERDUE" } }),
      db.invoice.aggregate({ where: { status: { in: ["SENT", "OVERDUE"] } }, _sum: { totalAmount: true } }),
    ]);
    return { open, sent, unpaid, overdue, owed: owed._sum.totalAmount ?? 0 };
  });
  const overdueColor = c.overdue > 0 ? PI_BUCKET_COLORS.OVERDUE : PI_BUCKET_COLORS.OVERDUE_NONE;
  return (
    <ScrollSummaryCard
      targetId={PROPOSALS_INVOICES_CARD_ID}
      className={`group relative w-full overflow-hidden rounded-2xl border border-card-border p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(16,185,129,0.15)] sm:p-5 ${PI_CARD_BG}`}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${PI_CARD_ACCENT_BAR}`} />
      <div className="grid grid-cols-4 items-center gap-1.5">
        <div className="col-span-2 flex items-center gap-2">
          <InvoicesIcon />
          <h3 className="whitespace-pre-line font-display text-lg font-semibold leading-tight text-ink">{labels.title}</h3>
        </div>
        <SubCard bg={PI_CARD_ACCENT_DOT} text="text-white" value={c.open} label={labels.openLabel} layout="row" className="col-span-2" />
        <SubCard bg={PI_BUCKET_COLORS.SENT.bg} text={PI_BUCKET_COLORS.SENT.text} value={c.sent} label={labels.sentLabel} />
        <SubCard bg={PI_BUCKET_COLORS.UNPAID.bg} text={PI_BUCKET_COLORS.UNPAID.text} value={c.unpaid} label={labels.unpaidLabel} />
        <SubCard bg={overdueColor.bg} text={overdueColor.text} value={c.overdue} label={labels.overdueLabel} />
        <SubCard bg={PI_BUCKET_COLORS.OWED.bg} text={PI_BUCKET_COLORS.OWED.text} value={money(c.owed, "CAD", lang)} label={labels.owedLabel} />
      </div>
    </ScrollSummaryCard>
  );
}
