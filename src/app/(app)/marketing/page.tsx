import Link from "next/link";
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
  affiliateStatus: string | null;
  brandedLink: string | null;
  followUpNeeded: boolean;
  notes: string | null;
  accountPlan: string | null;
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
}: {
  color: CardColor;
  title: string;
  programs: AffiliateProgramRow[];
  t: ReturnType<typeof getDict>;
}) {
  return (
    <Card
      color={color}
      title={title}
      actions={
        <Link href="/marketing/programs/new" className="text-xs font-semibold text-white hover:underline">
          + {t.marketing.newProgram}
        </Link>
      }
    >
      {programs.length === 0 ? (
        <p className="text-sm text-soft">{t.marketing.noAffiliateProgramsYet}</p>
      ) : (
        <div className="overflow-x-auto">
          {/* table-fixed + a shared colgroup (same widths in every card's own
              table) is what actually keeps columns aligned card to card —
              the default auto layout sizes each table's columns off its own
              content, so two cards with different data drift out of sync. */}
          <table className="w-full table-fixed divide-y divide-card-border text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead className="text-left text-xs font-medium uppercase tracking-wide text-soft">
              <tr>
                <th className="py-2 pr-4">{t.marketing.colProgram}</th>
                <th className="py-2 pr-4">{t.marketing.categoryLabel}</th>
                <th className="py-2 pr-4">{t.marketing.colType}</th>
                <th className="py-2 pr-4">{t.marketing.colStatus}</th>
                <th className="py-2 pr-4">{t.marketing.colFollowUp}</th>
                <th className="py-2 pr-4">{t.marketing.colLink}</th>
                <th className="py-2 pr-4">{t.marketing.colLinkedEmails}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {programs.map((p) => {
                const styles = statusStyle(p.affiliateStatus);
                return (
                  <tr key={p.id} id={p.id} className={`scroll-mt-24 ${styles.row} hover:brightness-95`}>
                    <td className={`truncate py-2 pr-4 pl-3 align-top font-medium border-l-4 ${styles.border}`}>
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
                    <td className="truncate py-2 pr-4 align-top text-ink/70">{p.followUpNeeded ? t.marketing.followUpYes : t.marketing.followUpNo}</td>
                    <td className="truncate py-2 pr-4 align-top">
                      {p.brandedLink ? (
                        <a href={p.brandedLink} target="_blank" rel="noopener noreferrer" className="text-amo-lime hover:underline">
                          {t.marketing.colLink}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="truncate py-2 pr-4 align-top text-ink/70">
                      {p.emailLinks.length > 0 ? t.marketing.linkedEmails(p.emailLinks.length) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
  const { affiliatePrograms, hour12 } = await withScopedPrismaClient(async (db) => {
    const affiliatePrograms = await db.affiliateProgram.findMany({
      where,
      orderBy: { name: "asc" },
      include: { emailLinks: { orderBy: { messageDate: "desc" } } },
    });
    const hour12 = await getHour12(session, db);
    return { affiliatePrograms, hour12 };
  });

  const grouped: Record<AffiliateStatusGroup, AffiliateProgramRow[]> = { ACTIVE: [], PENDING: [], NO_PROGRAM_OR_DECLINED: [] };
  for (const program of affiliatePrograms) {
    grouped[statusGroupOf(program.affiliateStatus)].push(program);
  }

  const categoryOptions = TAB_TITLES.map((section) => ({ value: section.tab, label: tabTitle(section.tab, t) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.marketing.title}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={session?.user.role === "ADMIN" ? <SyncShortIoButton lang={lang} /> : undefined}
      />

      <AffiliateProgramFilters
        q={q ?? ""}
        category={category}
        categoryOptions={categoryOptions}
        allCategoriesLabel={t.marketing.filterAll}
        searchPlaceholder={t.marketing.nameFilterPlaceholder}
        trailing={
          <span className="ml-auto rounded-full bg-amo-lime/15 px-3 py-1.5 text-sm font-semibold text-emerald-800">
            {t.marketing.shown(affiliatePrograms.length)}
          </span>
        }
      />

      <AffiliateProgramCard color="marketingActive" title={t.marketing.activeLinksTitle} programs={grouped.ACTIVE} t={t} />
      <AffiliateProgramCard color="marketingPending" title={t.marketing.pendingLinksTitle} programs={grouped.PENDING} t={t} />
      <AffiliateProgramCard
        color="marketingNoProgram"
        title={t.marketing.noProgramOrDeclinedTitle}
        programs={grouped.NO_PROGRAM_OR_DECLINED}
        t={t}
      />
    </div>
  );
}
