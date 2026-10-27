import Link from "next/link";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { accountingUserFor } from "@/lib/accounting/access";
import { getAccountingDashboard, type EntityDashboard } from "@/lib/accounting/dashboard";
import { KIND_LABEL } from "@/lib/accounting/options";
import { money } from "@/lib/accounting/format";
import AccountingIcon from "./accounting-icon";
import CardLink from "./card-link";
import ScrollSummaryCard from "./scroll-summary-card";
import SubCard from "./summary-sub-card";
import { ACCOUNTING_BUCKET_COLORS, ACCOUNTING_CARD_ACCENT_BAR, ACCOUNTING_CARD_ACCENT_DOT, ACCOUNTING_CARD_BG } from "./accounting-summary-colors";

export const ACCOUNTING_CARDS_ID = "dashboard-accounting-cards";

export interface AccountingSummaryLabels {
  title: string;
  entitiesLabel: string;
  toCategorizeLabel: string;
  toConfirmLabel: string;
  banksLabel: string;
  taxLabel: string;
}

export interface AccountingEntityLabels {
  income: string;
  expenses: string;
  net: string;
  ytd: string;
  mtd: string;
  toCategorize: string;
  toConfirm: string;
  salesTax: string;
  open: string;
  betweenEntities: string;
}

// Accounting is only for users allowed to use it (admins, and team members with Accounting turned on); everyone else
// simply doesn't get these cards.
async function loadEntities(): Promise<EntityDashboard[] | null> {
  const session = await auth();
  return withScopedPrismaClient(async (db) => {
    const me = await accountingUserFor(db, session);
    return me ? getAccountingDashboard(db, me.id) : null;
  });
}

export async function AccountingSummaryCardServer({ labels }: { labels: AccountingSummaryLabels }) {
  const entities = await loadEntities();
  if (!entities) return null;
  const sum = (f: (e: EntityDashboard) => number) => entities.reduce((n, e) => n + f(e), 0);
  return (
    <ScrollSummaryCard
      targetId={ACCOUNTING_CARDS_ID}
      className={`group relative w-full overflow-hidden rounded-2xl border border-card-border p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(5,150,105,0.15)] sm:p-5 ${ACCOUNTING_CARD_BG}`}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${ACCOUNTING_CARD_ACCENT_BAR}`} />
      <div className="grid grid-cols-4 items-center gap-1.5">
        <div className="col-span-2 flex items-center gap-2">
          <AccountingIcon />
          <h3 className="font-display text-lg font-semibold text-ink">{labels.title}</h3>
        </div>
        <SubCard bg={ACCOUNTING_CARD_ACCENT_DOT} text="text-white" value={entities.length} label={labels.entitiesLabel} layout="row" className="col-span-2" />
        <SubCard bg={ACCOUNTING_BUCKET_COLORS.TO_CATEGORIZE.bg} text={ACCOUNTING_BUCKET_COLORS.TO_CATEGORIZE.text} value={sum((e) => e.toCategorize)} label={labels.toCategorizeLabel} />
        <SubCard bg={ACCOUNTING_BUCKET_COLORS.TO_CONFIRM.bg} text={ACCOUNTING_BUCKET_COLORS.TO_CONFIRM.text} value={sum((e) => e.toConfirm)} label={labels.toConfirmLabel} />
        <SubCard bg={ACCOUNTING_BUCKET_COLORS.BANKS.bg} text={ACCOUNTING_BUCKET_COLORS.BANKS.text} value={sum((e) => e.bankAccounts)} label={labels.banksLabel} />
        <SubCard bg={ACCOUNTING_BUCKET_COLORS.TAX.bg} text={ACCOUNTING_BUCKET_COLORS.TAX.text} value={sum((e) => (e.salesTaxRegistered ? 1 : 0))} label={labels.taxLabel} />
      </div>
    </ScrollSummaryCard>
  );
}

function Row({ label, ytd, mtd, currency, lang, strong }: { label: string; ytd: number; mtd: number; currency: string; lang: "en" | "fr"; strong?: boolean }) {
  const tone = (n: number) => (strong && n < 0 ? "text-red-600" : "text-ink");
  return (
    <tr>
      <th className="py-1 text-left font-medium text-soft">{label}</th>
      <td className={`py-1 text-right tabular-nums ${strong ? "font-bold" : "font-semibold"} ${tone(ytd)}`}>{money(ytd, currency, lang)}</td>
      <td className={`py-1 text-right tabular-nums ${strong ? "font-bold" : "font-semibold"} ${tone(mtd)}`}>{money(mtd, currency, lang)}</td>
    </tr>
  );
}

// One Dashboard card per accounting entity (the person and each business), each opening the Accounting screen.
export async function AccountingEntityCards({ lang, labels }: { lang: "en" | "fr"; labels: AccountingEntityLabels }) {
  const entities = await loadEntities();
  if (!entities || entities.length === 0) return null;
  return (
    <div id={ACCOUNTING_CARDS_ID} className="scroll-mt-20 space-y-2 sm:space-y-4">
      {entities.map((e) => (
        <CardLink key={e.id} href="/accounting" className={`relative overflow-hidden rounded-2xl border border-card-border p-2 shadow-sm sm:p-5 ${ACCOUNTING_CARD_BG}`}>
          <div className={`absolute inset-x-0 top-0 h-[3px] ${ACCOUNTING_CARD_ACCENT_BAR}`} />
          <div className="flex items-center gap-2">
            <AccountingIcon size="h-8 w-8" iconSize="h-5 w-5" />
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-semibold leading-tight text-ink">{e.name}</h2>
              <p className="text-xs text-soft">
                {KIND_LABEL[e.kind]?.[lang] ?? e.kind} · {e.country}
                {e.province ? `-${e.province}` : ""}
              </p>
            </div>
            <Link href="/accounting" className="ml-auto shrink-0 text-xs font-semibold text-amo-lime hover:underline">
              {labels.open} →
            </Link>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-soft">
                <th />
                <th className="pb-1 text-right font-semibold">{labels.ytd}</th>
                <th className="pb-1 text-right font-semibold">{labels.mtd}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              <Row label={labels.income} ytd={e.ytd.income} mtd={e.mtd.income} currency={e.currency} lang={lang} />
              <Row label={labels.expenses} ytd={e.ytd.expenses} mtd={e.mtd.expenses} currency={e.currency} lang={lang} />
              <Row label={labels.net} ytd={e.ytd.net} mtd={e.mtd.net} currency={e.currency} lang={lang} strong />
            </tbody>
          </table>
          {e.links.length > 0 && (
            <div className="mt-3 rounded-lg bg-black/[0.03] p-2">
              <p className="text-xs font-semibold uppercase text-soft">{labels.betweenEntities}</p>
              <ul className="mt-1 divide-y divide-card-border text-sm">
                {e.links.map((l) => (
                  <li key={l.id} className="flex items-baseline justify-between gap-2 py-1">
                    <span className="min-w-0 truncate text-soft">
                      <span className="text-ink">{lang === "fr" ? l.nameFr ?? l.name : l.name}</span> · {l.otherEntity}
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${l.balance < 0 ? "text-red-600" : "text-ink"}`}>{money(l.balance, e.currency, lang)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(e.toCategorize > 0 || e.toConfirm > 0 || e.salesTaxRegistered) && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              {e.toCategorize > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{e.toCategorize} {labels.toCategorize}</span>}
              {e.toConfirm > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800">{e.toConfirm} {labels.toConfirm}</span>}
              {e.salesTaxRegistered && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-teal-800">{labels.salesTax}</span>}
            </div>
          )}
        </CardLink>
      ))}
    </div>
  );
}
