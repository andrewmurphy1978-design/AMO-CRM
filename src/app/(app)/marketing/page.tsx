import Link from "next/link";
import { format, type Locale } from "date-fns";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import type { AffiliateProgramTab, Prisma } from "@prisma/client";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getHour12 } from "@/lib/time-format";
import { statusGroupOf, statusStyle, type AffiliateStatusGroup } from "@/lib/affiliate-status";
import PageHeader from "../page-header";
import Card, { type CardColor } from "@/components/section-card";
import SyncShortIoButton from "./programs/sync-shortio-button";
import AffiliateProgramFilters from "./programs/filters";

type AffiliateProgramRow = {
  id: string;
  tab: AffiliateProgramTab;
  name: string;
  type: string | null;
  iconUrl: string | null;
  affiliateStatus: string | null;
  followUpNeeded: boolean;
  followUpDate: Date | null;
  notes: string | null;
  accountPlan: string | null;
  shortioClicks: number | null;
  shortioClicksFr: number | null;
  emailLinks: { id: string; subject: string | null; fromLabel: string | null; messageDate: Date | null; gmailLink: string | null }[];
};

const TAB_TITLES: { tab: AffiliateProgramTab; key: "aiToolsTitle" | "trainingProgramsTitle" | "businessOpportunitiesTitle" }[] = [
  { tab: "AI_TOOLS", key: "aiToolsTitle" },
  { tab: "TRAINING_PROGRAMS", key: "trainingProgramsTitle" },
  { tab: "BUSINESS_OPPORTUNITIES", key: "businessOpportunitiesTitle" },
];

function tabTitle(tab: AffiliateProgramTab, t: ReturnType<typeof getDict>): string {
  return t.marketing[TAB_TITLES.find((section) => section.tab === tab)?.key ?? "aiToolsTitle"];
}

function AffiliateProgramCard({
  color,
  title,
  programs,
  t,
  dateLocale,
}: {
  color: CardColor;
  title: string;
  programs: AffiliateProgramRow[];
  t: ReturnType<typeof getDict>;
  dateLocale: Locale | undefined;
}) {
  return (
    <Card color={color} title={title}>
      {programs.length === 0 ? (
        <p className="text-sm text-soft">{t.marketing.noAffiliateProgramsYet}</p>
      ) : (
        <>
          {/* Mobile: 2-line rows instead of the desktop table — no column
              headings, just what fits. Line 1: logo, name, status
              (right-aligned). Line 2: tab/type, follow-up (right-aligned). */}
          <div className="divide-y divide-card-border sm:hidden">
            {programs.map((p) => {
              const styles = statusStyle(p.affiliateStatus);
              const typeLine = [tabTitle(p.tab, t), p.type].filter(Boolean).join(" / ") || "—";
              const followUp = p.followUpNeeded
                ? p.followUpDate
                  ? format(p.followUpDate, "PP", { locale: dateLocale })
                  : t.marketing.followUpYes
                : t.marketing.followUpNo;
              return (
                <Link
                  key={p.id}
                  href={`/marketing/programs/${p.id}`}
                  className={`block scroll-mt-24 border-l-4 px-2 py-1 ${styles.row} ${styles.border} hover:brightness-95`}
                >
                  <div className="flex items-center gap-2">
                    {p.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.iconUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-contain" />
                    ) : (
                      <span className="h-5 w-5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.name}</span>
                    <span className={`inline-flex shrink-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${styles.badge}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />
                      <span className="max-w-[7rem] truncate">{p.affiliateStatus || "—"}</span>
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 pl-7 text-xs text-ink/70">
                    <span className="min-w-0 flex-1 truncate">{typeLine}</span>
                    <span className="shrink-0">{followUp}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop/tablet: full table, unchanged. */}
          <div className="hidden overflow-x-auto sm:block">
          {/* table-fixed + a shared colgroup (same widths in every card's own
              table) is what actually keeps columns aligned card to card —
              the default auto layout sizes each table's columns off its own
              content, so two cards with different data drift out of sync. */}
          <table className="w-full table-fixed divide-y divide-card-border text-sm">
            <colgroup>
              <col className="w-[5%]" />
              <col className="w-[17%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[21%]" />
              <col className="w-[9%]" />
              <col className="w-[6%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="text-left text-xs font-medium uppercase tracking-wide text-soft">
              <tr>
                <th className="py-2 pr-4"></th>
                <th className="py-2 pr-4">{t.marketing.colProgram}</th>
                <th className="py-2 pr-4 whitespace-nowrap">{t.marketing.colType}</th>
                <th className="py-2 pr-4">{t.marketing.categoryLabel}</th>
                <th className="py-2 pr-4 whitespace-nowrap">{t.marketing.colStatus}</th>
                <th className="py-2 pr-4 whitespace-nowrap">{t.marketing.colFollowUp}</th>
                <th className="py-2 pr-2 whitespace-nowrap">{t.marketing.colClicks}</th>
                <th className="py-2 pr-2 whitespace-nowrap">{t.marketing.colConversions}</th>
                <th className="py-2 pr-2 whitespace-nowrap">{t.marketing.colLinkedEmails}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {programs.map((p) => {
                const styles = statusStyle(p.affiliateStatus);
                const clicks = p.shortioClicks == null && p.shortioClicksFr == null ? null : (p.shortioClicks ?? 0) + (p.shortioClicksFr ?? 0);
                return (
                  <tr key={p.id} id={p.id} className={`scroll-mt-24 ${styles.row} hover:brightness-95`}>
                    <td className={`py-2 pr-2 pl-3 align-top border-l-4 ${styles.border}`}>
                      {p.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.iconUrl} alt="" className="h-6 w-6 rounded-full object-contain" />
                      ) : null}
                    </td>
                    <td className="truncate py-2 pr-4 align-top font-medium">
                      <Link href={`/marketing/programs/${p.id}`} className="text-ink hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="truncate py-2 pr-4 align-top text-ink/70">{tabTitle(p.tab, t)}</td>
                    <td className="truncate py-2 pr-4 align-top text-ink/70">{p.type || "—"}</td>
                    <td className="py-2 pr-4 align-top">
                      <span className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-xs font-medium ${styles.badge}`}>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />
                        <span className="truncate">{p.affiliateStatus || "—"}</span>
                      </span>
                    </td>
                    <td className="truncate py-2 pr-4 align-top text-ink/70">
                      {p.followUpNeeded
                        ? p.followUpDate
                          ? format(p.followUpDate, "PP", { locale: dateLocale })
                          : t.marketing.followUpYes
                        : t.marketing.followUpNo}
                    </td>
                    <td className="truncate py-2 pr-2 align-top text-ink/70">{clicks ?? "—"}</td>
                    {/* Not tracked yet — Short.io reports clicks, not
                        conversions/sales, so there's no real number to show
                        here until a conversion source is wired up. */}
                    <td className="truncate py-2 pr-2 align-top text-ink/70">—</td>
                    <td className="truncate py-2 pr-2 align-top text-ink/70">{p.emailLinks.length > 0 ? p.emailLinks.length : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}
    </Card>
  );
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const { q, category: rawCategory } = await searchParams;
  const category =
    rawCategory === "AI_TOOLS" || rawCategory === "TRAINING_PROGRAMS" || rawCategory === "BUSINESS_OPPORTUNITIES" ? rawCategory : null;

  const where: Prisma.AffiliateProgramWhereInput = {};
  if (category) where.tab = category;
  if (q) where.name = { contains: q, mode: "insensitive" };

  // One shared client — see src/lib/prisma.ts for why (each `prisma.x`
  // property access on the raw proxy opens a brand-new connection, and
  // the previous Promise.all opened two of them at once, which is worse
  // than sequential for Cloudflare's Error 1102 resource limit).
  const { affiliatePrograms, tabCounts, hour12 } = await withScopedPrismaClient(async (db) => {
    const affiliatePrograms = await db.affiliateProgram.findMany({
      where,
      orderBy: { name: "asc" },
      include: { emailLinks: { orderBy: { messageDate: "desc" } } },
    });
    // Unfiltered by category/q so the pills always reflect true totals,
    // not just what the current filter happens to show.
    const tabCounts = await db.affiliateProgram.groupBy({ by: ["tab"], _count: { _all: true } });
    const hour12 = await getHour12(session, db);
    return { affiliatePrograms, tabCounts, hour12 };
  });

  const grouped: Record<AffiliateStatusGroup, AffiliateProgramRow[]> = { ACTIVE: [], PENDING: [], NO_PROGRAM_OR_DECLINED: [] };
  for (const program of affiliatePrograms) {
    grouped[statusGroupOf(program.affiliateStatus)].push(program);
  }

  const countByTab = new Map(tabCounts.map((row) => [row.tab, row._count._all]));
  const categoryOptions = TAB_TITLES.map((section) => ({
    value: section.tab,
    label: tabTitle(section.tab, t),
    count: countByTab.get(section.tab) ?? 0,
  }));
  const totalCount = tabCounts.reduce((sum, row) => sum + row._count._all, 0);

  const shownPill = (
    <span className="ml-auto rounded-full bg-amo-lime/15 px-3 py-1.5 text-sm font-semibold text-emerald-800">
      {t.marketing.shown(affiliatePrograms.length)}
    </span>
  );

  return (
    // Mobile: tighter gap-2 rhythm throughout, same as the Contacts page —
    // most noticeably between the header and the filter row, which used
    // to sit a full 24px below it for no reason. Desktop keeps gap-6.
    <div className="flex flex-col gap-2 sm:gap-6">
      <PageHeader
        title={t.marketing.title}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={
          // Mobile only: tight grouping so the Add Program icon doesn't
          // fight the page title for room — same `sm:contents` trick as
          // Email/Calendar/Contacts' own header actions, which drops this
          // wrapper's box at sm+ so desktop spacing is unchanged.
          <div className="flex flex-wrap items-start gap-2 sm:contents">
            <Link
              href="/marketing/programs/new"
              title={t.marketing.newProgram}
              aria-label={t.marketing.newProgram}
              className="btn-primary flex items-center justify-center rounded-lg p-1.5 shadow-sm sm:justify-start sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm sm:font-semibold"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
              {/* Mobile: bare icon, same convention as every other page's
                  Add/New action. Desktop/tablet (sm+) keeps the label. */}
              <span className="hidden sm:inline">{t.marketing.newProgram}</span>
            </Link>
            {session?.user.role === "ADMIN" && <SyncShortIoButton lang={lang} />}
          </div>
        }
      />

      <AffiliateProgramFilters
        q={q ?? ""}
        category={category}
        categoryOptions={categoryOptions}
        allCategoriesCount={totalCount}
        allCategoriesLabel={t.marketing.filterAll}
        searchPlaceholder={t.marketing.nameFilterPlaceholder}
        trailing={shownPill}
      />

      {/* Mobile only: the filter row has no room left for the shown-count
          pill, so it repeats here, on its own line right below the fields
          (AffiliateProgramFilters renders the same `trailing` node on
          desktop instead, at the end of the filter row). */}
      <div className="flex sm:hidden">{shownPill}</div>

      <AffiliateProgramCard color="marketingActive" title={t.marketing.activeLinksTitle} programs={grouped.ACTIVE} t={t} dateLocale={dateLocale} />
      <AffiliateProgramCard color="marketingPending" title={t.marketing.pendingLinksTitle} programs={grouped.PENDING} t={t} dateLocale={dateLocale} />
      <AffiliateProgramCard
        color="marketingNoProgram"
        title={t.marketing.noProgramOrDeclinedTitle}
        programs={grouped.NO_PROGRAM_OR_DECLINED}
        t={t}
        dateLocale={dateLocale}
      />
    </div>
  );
}
