import Link from "next/link";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getHour12 } from "@/lib/time-format";
import type { AffiliateProgramTab } from "@prisma/client";
import { classifyAffiliateStatus, AFFILIATE_STATUS_BUCKETS, AFFILIATE_STATUS_STYLES, type AffiliateStatusBucket } from "@/lib/affiliate-status";
import PageHeader from "../page-header";

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

type ProgramView = "category" | "status" | "followup";

type ProgramGroup = { key: string; title: string; tab?: AffiliateProgramTab; programs: AffiliateProgramRow[] };

// The three tabs on the "AMO Affiliate Link Tracker" sheet that hold actual
// affiliate programs (see src/lib/affiliate-sheet.ts) — Link Tracker,
// Follow-ups, Dashboard, and Lists aren't synced.
function tabSections(t: ReturnType<typeof getDict>): { tab: AffiliateProgramTab; title: string }[] {
  return [
    { tab: "AI_TOOLS", title: t.marketing.aiToolsTitle },
    { tab: "TRAINING_PROGRAMS", title: t.marketing.trainingProgramsTitle },
    { tab: "BUSINESS_OPPORTUNITIES", title: t.marketing.businessOpportunitiesTitle },
  ];
}

function tabTitle(tab: AffiliateProgramTab, t: ReturnType<typeof getDict>): string {
  return tabSections(t).find((section) => section.tab === tab)?.title ?? tab;
}

function statusBucketLabel(bucket: AffiliateStatusBucket, t: ReturnType<typeof getDict>): string {
  switch (bucket) {
    case "APPROVED_LIVE":
      return t.marketing.statusApprovedLive;
    case "PENDING_APPROVAL":
      return t.marketing.statusPendingApproval;
    case "PARTNER_TO_VERIFY":
      return t.marketing.statusPartnerToVerify;
    case "FALLBACK_ACTIVE":
      return t.marketing.statusFallbackActive;
    case "FALLBACK_NO_PUBLIC_PROGRAM":
      return t.marketing.statusFallbackNoPublicProgram;
    case "DECLINED":
      return t.marketing.statusDeclined;
    case "OTHER":
      return t.marketing.statusOther;
  }
}

function groupProgramsForView(view: ProgramView, programs: AffiliateProgramRow[], t: ReturnType<typeof getDict>): ProgramGroup[] {
  if (view === "status") {
    const byBucket = new Map<AffiliateStatusBucket, AffiliateProgramRow[]>();
    for (const p of programs) {
      const bucket = classifyAffiliateStatus(p.affiliateStatus);
      const list = byBucket.get(bucket) ?? [];
      list.push(p);
      byBucket.set(bucket, list);
    }
    return AFFILIATE_STATUS_BUCKETS.filter((bucket) => byBucket.has(bucket)).map((bucket) => ({
      key: bucket,
      title: statusBucketLabel(bucket, t),
      programs: byBucket.get(bucket)!,
    }));
  }

  if (view === "followup") {
    return [
      { key: "needed", title: t.marketing.followUpNeededTitle, programs: programs.filter((p) => p.followUpNeeded) },
      { key: "not-needed", title: t.marketing.followUpNotNeededTitle, programs: programs.filter((p) => !p.followUpNeeded) },
    ];
  }

  return tabSections(t).map(({ tab, title }) => ({ key: tab, title, tab, programs: programs.filter((p) => p.tab === tab) }));
}

function AffiliateProgramCard({
  tab,
  title,
  programs,
  t,
  showCategoryColumn,
}: {
  tab?: AffiliateProgramTab;
  title: string;
  programs: AffiliateProgramRow[];
  t: ReturnType<typeof getDict>;
  showCategoryColumn: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <Link
          href={tab ? `/marketing/programs/new?tab=${tab}` : "/marketing/programs/new"}
          className="text-xs font-semibold text-amo-lime hover:underline"
        >
          + {t.marketing.newProgram}
        </Link>
      </div>
      {programs.length === 0 ? (
        <p className="mt-2 text-sm text-soft">{t.marketing.noAffiliateProgramsYet}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-card-border text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wide text-soft">
              <tr>
                <th className="py-2 pr-4">{t.marketing.colProgram}</th>
                {showCategoryColumn && <th className="py-2 pr-4">{t.marketing.categoryLabel}</th>}
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
                    {showCategoryColumn && <td className="py-2 pr-4 align-top text-ink/70">{tabTitle(p.tab, t)}</td>}
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

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const { view: rawView } = await searchParams;
  const view: ProgramView = rawView === "status" || rawView === "followup" ? rawView : "category";

  // One shared client — see src/lib/prisma.ts for why (each `prisma.x`
  // property access on the raw proxy opens a brand-new connection, and
  // the previous Promise.all opened two of them at once, which is worse
  // than sequential for Cloudflare's Error 1102 resource limit).
  const { campaigns, automations, affiliatePrograms, hour12 } = await withScopedPrismaClient(async (db) => {
    const campaigns = await db.emailCampaign.findMany({ orderBy: { systemeIoId: "desc" } });
    const automations = await db.automationWorkflow.findMany({ orderBy: { systemeIoId: "desc" } });
    const affiliatePrograms = await db.affiliateProgram.findMany({
      orderBy: { name: "asc" },
      include: { emailLinks: { orderBy: { messageDate: "desc" } } },
    });
    const hour12 = await getHour12(session, db);
    return { campaigns, automations, affiliatePrograms, hour12 };
  });

  const groups = groupProgramsForView(view, affiliatePrograms, t);
  const viewTabs: { key: ProgramView; label: string }[] = [
    { key: "category", label: t.marketing.viewByCategory },
    { key: "status", label: t.marketing.viewByStatus },
    { key: "followup", label: t.marketing.viewByFollowUp },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t.marketing.title} hour12={hour12} dateLocale={dateLocale} location={t.dashboard.myLocation} />
      <p className="text-sm text-soft">{t.marketing.subtitle}</p>

      <div>
        <h1 className="font-display text-xl font-semibold text-ink">{t.marketing.affiliateProgramsTitle}</h1>
        <p className="text-sm text-soft">{t.marketing.affiliateProgramsSubtitle}</p>
      </div>

      <div className="flex items-center gap-5 border-b border-card-border">
        {viewTabs.map((vt) => (
          <Link
            key={vt.key}
            href={vt.key === "category" ? "/marketing" : `/marketing?view=${vt.key}`}
            className={`-mb-px border-b-2 pb-2 text-sm font-semibold ${
              view === vt.key ? "border-amo-lime text-ink" : "border-transparent text-soft hover:text-ink"
            }`}
          >
            {vt.label}
          </Link>
        ))}
      </div>

      {groups.map((g) => (
        <AffiliateProgramCard key={g.key} tab={g.tab} title={g.title} programs={g.programs} t={t} showCategoryColumn={view !== "category"} />
      ))}

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">{t.marketing.campaignsTitle}</h2>
        {campaigns.length === 0 ? (
          <p className="mt-2 text-sm text-soft">{t.marketing.noCampaignsYet}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-card-border text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-soft">
                <tr>
                  <th className="py-2 pr-4">{t.marketing.colSubject}</th>
                  <th className="py-2 pr-4">{t.marketing.colStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-4 font-medium text-ink">{c.subject ?? c.name ?? "—"}</td>
                    <td className="py-2 pr-4 text-ink/70">
                      {c.status === "sent" ? t.marketing.statusSent : c.status === "draft" ? t.marketing.statusDraft : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">{t.marketing.automationsTitle}</h2>
        {automations.length === 0 ? (
          <p className="mt-2 text-sm text-soft">{t.marketing.noAutomationsYet}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-card-border text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-soft">
                <tr>
                  <th className="py-2 pr-4">{t.marketing.colName}</th>
                  <th className="py-2 pr-4">{t.marketing.colStatus}</th>
                  <th className="py-2 pr-4">{t.marketing.colTrigger}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {automations.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-4 font-medium text-ink">{a.name ?? "—"}</td>
                    <td className="py-2 pr-4 text-ink/70">
                      {a.status === "active" ? t.marketing.statusActive : a.status === "inactive" ? t.marketing.statusInactive : "—"}
                    </td>
                    <td className="py-2 pr-4 text-ink/70">
                      {a.triggerType ? (t.marketing.triggerTypes[a.triggerType as keyof typeof t.marketing.triggerTypes] ?? a.triggerType) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
