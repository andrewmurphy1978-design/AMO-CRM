import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getHour12 } from "@/lib/time-format";
import type { AffiliateProgramTab } from "@prisma/client";
import { classifyAffiliateStatus, AFFILIATE_STATUS_STYLES, type AffiliateStatusBucket } from "@/lib/affiliate-status";
import PageHeader from "../page-header";
import SyncShortIoButton from "./programs/sync-shortio-button";

type AffiliateProgramRow = {
  id: string;
  tab: AffiliateProgramTab;
  name: string;
  type: string | null;
  category: string | null;
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

// Collapses the 6 fine-grained status buckets (see src/lib/affiliate-status.ts)
// down to the 3 groups this page is organized around: a program with its
// real affiliate link live and working, one still being pursued (or
// running on a fallback link while that happens), and one with nothing to
// chase — no public program exists, or it was turned down.
type StatusGroup = "ACTIVE" | "PENDING" | "NO_PROGRAM_OR_DECLINED";

function statusGroupOf(bucket: AffiliateStatusBucket): StatusGroup {
  switch (bucket) {
    case "APPROVED_LIVE":
      return "ACTIVE";
    case "PENDING_APPROVAL":
    case "PARTNER_TO_VERIFY":
    case "FALLBACK_ACTIVE":
      return "PENDING";
    case "FALLBACK_NO_PUBLIC_PROGRAM":
    case "DECLINED":
    case "OTHER":
      return "NO_PROGRAM_OR_DECLINED";
  }
}

function AffiliateProgramCard({
  title,
  programs,
  t,
  filters,
}: {
  title: string;
  programs: AffiliateProgramRow[];
  t: ReturnType<typeof getDict>;
  filters?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <div className="flex items-center gap-4">
          {filters}
          <Link href="/marketing/programs/new" className="text-xs font-semibold text-amo-lime hover:underline">
            + {t.marketing.newProgram}
          </Link>
        </div>
      </div>
      {programs.length === 0 ? (
        <p className="mt-2 text-sm text-soft">{t.marketing.noAffiliateProgramsYet}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-card-border text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wide text-soft">
              <tr>
                <th className="py-2 pr-4">{t.marketing.colProgram}</th>
                <th className="py-2 pr-4">{t.marketing.categoryLabel}</th>
                <th className="py-2 pr-4">{t.marketing.colType}</th>
                <th className="py-2 pr-4">{t.marketing.colStatus}</th>
                <th className="py-2 pr-4">{t.marketing.colFollowUp}</th>
                <th className="py-2 pr-4">{t.marketing.colLink}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {programs.map((p) => {
                const bucket = classifyAffiliateStatus(p.affiliateStatus);
                const styles = AFFILIATE_STATUS_STYLES[bucket];
                return (
                  <tr key={p.id} id={p.id} className={`scroll-mt-24 ${styles.row} hover:brightness-95`}>
                    <td className={`py-2 pr-4 pl-3 align-top font-medium border-l-4 ${styles.border}`}>
                      <Link href={`/marketing/programs/${p.id}`} className="text-ink hover:underline">
                        {p.name}
                      </Link>
                      {p.emailLinks.length > 0 && (
                        <span className="ml-2 text-xs font-normal text-emerald-700">{t.marketing.linkedEmails(p.emailLinks.length)}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 align-top text-ink/70">{tabTitle(p.tab, t)}</td>
                    <td className="py-2 pr-4 align-top text-ink/70">{[p.type, p.category].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="py-2 pr-4 align-top">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${styles.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                        {p.affiliateStatus || "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 align-top text-ink/70">{p.followUpNeeded ? t.marketing.followUpYes : t.marketing.followUpNo}</td>
                    <td className="py-2 pr-4 align-top">
                      {p.brandedLink ? (
                        <a href={p.brandedLink} target="_blank" rel="noopener noreferrer" className="text-amo-lime hover:underline">
                          {t.marketing.colLink}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ activeCategory?: string }> }) {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const { activeCategory: rawActiveCategory } = await searchParams;
  const activeCategory =
    rawActiveCategory === "AI_TOOLS" || rawActiveCategory === "TRAINING_PROGRAMS" || rawActiveCategory === "BUSINESS_OPPORTUNITIES"
      ? rawActiveCategory
      : null;

  // One shared client — see src/lib/prisma.ts for why (each `prisma.x`
  // property access on the raw proxy opens a brand-new connection, and
  // the previous Promise.all opened two of them at once, which is worse
  // than sequential for Cloudflare's Error 1102 resource limit).
  const { affiliatePrograms, hour12 } = await withScopedPrismaClient(async (db) => {
    const affiliatePrograms = await db.affiliateProgram.findMany({
      orderBy: { name: "asc" },
      include: { emailLinks: { orderBy: { messageDate: "desc" } } },
    });
    const hour12 = await getHour12(session, db);
    return { affiliatePrograms, hour12 };
  });

  const grouped: Record<StatusGroup, AffiliateProgramRow[]> = { ACTIVE: [], PENDING: [], NO_PROGRAM_OR_DECLINED: [] };
  for (const program of affiliatePrograms) {
    grouped[statusGroupOf(classifyAffiliateStatus(program.affiliateStatus))].push(program);
  }
  const activePrograms = activeCategory ? grouped.ACTIVE.filter((p) => p.tab === activeCategory) : grouped.ACTIVE;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.marketing.title}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={session?.user.role === "ADMIN" ? <SyncShortIoButton lang={lang} /> : undefined}
      />

      <AffiliateProgramCard
        title={t.marketing.activeLinksTitle}
        programs={activePrograms}
        t={t}
        filters={
          <div className="flex items-center gap-3 text-xs font-semibold">
            {([null, ...TAB_TITLES.map((s) => s.tab)] as const).map((key) => (
              <Link
                key={key ?? "ALL"}
                href={key ? `/marketing?activeCategory=${key}` : "/marketing"}
                className={activeCategory === key ? "text-ink underline" : "text-soft hover:text-ink"}
              >
                {key ? tabTitle(key, t) : t.marketing.filterAll}
              </Link>
            ))}
          </div>
        }
      />
      <AffiliateProgramCard title={t.marketing.pendingLinksTitle} programs={grouped.PENDING} t={t} />
      <AffiliateProgramCard title={t.marketing.noProgramOrDeclinedTitle} programs={grouped.NO_PROGRAM_OR_DECLINED} t={t} />
    </div>
  );
}
