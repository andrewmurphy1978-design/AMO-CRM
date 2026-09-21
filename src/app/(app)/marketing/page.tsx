import { format } from "date-fns";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getHour12 } from "@/lib/time-format";
import type { AffiliateProgramTab } from "@prisma/client";
import PageHeader from "../page-header";
import DeleteAffiliateProgramButton from "./programs/delete-button";

type AffiliateProgramRow = {
  id: string;
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

function AffiliateProgramCard({
  tab,
  title,
  programs,
  t,
  lang,
  dateLocale,
}: {
  tab: AffiliateProgramTab;
  title: string;
  programs: AffiliateProgramRow[];
  t: ReturnType<typeof getDict>;
  lang: Lang;
  dateLocale: ReturnType<typeof getDateLocale>;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <Link href={`/marketing/programs/new?tab=${tab}`} className="text-xs font-semibold text-amo-lime hover:underline">
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
                <th className="py-2 pr-4">{t.marketing.colType}</th>
                <th className="py-2 pr-4">{t.marketing.colStatus}</th>
                <th className="py-2 pr-4">{t.marketing.colFollowUp}</th>
                <th className="py-2 pr-4">{t.marketing.colLink}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {programs.map((p) => (
                <tr key={p.id} id={p.id} className="scroll-mt-24">
                  <td className="py-2 pr-4 align-top font-medium text-ink">
                    <details>
                      <summary className="cursor-pointer select-none">
                        {p.name}
                        {p.emailLinks.length > 0 && (
                          <span className="ml-2 text-xs font-normal text-emerald-700">{t.marketing.linkedEmails(p.emailLinks.length)}</span>
                        )}
                      </summary>
                      <div className="mt-2 max-w-md space-y-2 text-xs font-normal text-ink/80">
                        {p.notes && (
                          <p>
                            <span className="font-semibold text-soft">{t.marketing.notesLabel}: </span>
                            {p.notes}
                          </p>
                        )}
                        {p.accountPlan && (
                          <p>
                            <span className="font-semibold text-soft">{t.marketing.accountPlanLabel}: </span>
                            {p.accountPlan}
                          </p>
                        )}
                        <div>
                          <p className="font-semibold text-soft">{t.contactDetail.linkedEmailsTitle}</p>
                          {p.emailLinks.length === 0 ? (
                            <p className="text-soft">{t.marketing.noLinkedEmailsYet}</p>
                          ) : (
                            <ul className="mt-1 space-y-1">
                              {p.emailLinks.map((link) => (
                                <li key={link.id}>
                                  {link.gmailLink ? (
                                    <a href={link.gmailLink} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">
                                      {link.subject || "—"}
                                    </a>
                                  ) : (
                                    <span>{link.subject || "—"}</span>
                                  )}
                                  <span className="text-soft">
                                    {" "}
                                    · {link.fromLabel}
                                    {link.messageDate && ` · ${format(link.messageDate, "PP", { locale: dateLocale })}`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="flex items-center gap-3 pt-1">
                          <Link href={`/marketing/programs/${p.id}/edit`} className="font-semibold text-amo-lime hover:underline">
                            {t.common.edit}
                          </Link>
                          <DeleteAffiliateProgramButton programId={p.id} lang={lang} />
                        </div>
                      </div>
                    </details>
                  </td>
                  <td className="py-2 pr-4 align-top text-ink/70">{[p.type, p.category].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="py-2 pr-4 align-top text-ink/70">{p.affiliateStatus || "—"}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function MarketingPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

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

  const programsByTab = new Map<AffiliateProgramTab, AffiliateProgramRow[]>();
  for (const program of affiliatePrograms) {
    const list = programsByTab.get(program.tab) ?? [];
    list.push(program);
    programsByTab.set(program.tab, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.marketing.title} hour12={hour12} dateLocale={dateLocale} location={t.dashboard.myLocation} />
      <p className="text-sm text-soft">{t.marketing.subtitle}</p>

      <div>
        <h1 className="font-display text-xl font-semibold text-ink">{t.marketing.affiliateProgramsTitle}</h1>
        <p className="text-sm text-soft">{t.marketing.affiliateProgramsSubtitle}</p>
      </div>

      {tabSections(t).map(({ tab, title }) => (
        <AffiliateProgramCard key={tab} tab={tab} title={title} programs={programsByTab.get(tab) ?? []} t={t} lang={lang} dateLocale={dateLocale} />
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
