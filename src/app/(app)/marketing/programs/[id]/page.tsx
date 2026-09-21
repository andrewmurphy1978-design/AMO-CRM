import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getHour12 } from "@/lib/time-format";
import type { AffiliateProgramTab } from "@prisma/client";
import { classifyAffiliateStatus, AFFILIATE_STATUS_STYLES } from "@/lib/affiliate-status";
import PageHeader, { HeaderBreadcrumb } from "../../../page-header";
import DeleteAffiliateProgramButton from "../delete-button";
import CreateShortIoLinkButton from "../create-shortio-link-button";
import RefreshStatsButton from "../refresh-stats-button";

const LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide text-soft";

function tabTitle(tab: AffiliateProgramTab, t: ReturnType<typeof getDict>): string {
  switch (tab) {
    case "AI_TOOLS":
      return t.marketing.aiToolsTitle;
    case "TRAINING_PROGRAMS":
      return t.marketing.trainingProgramsTitle;
    case "BUSINESS_OPPORTUNITIES":
      return t.marketing.businessOpportunitiesTitle;
  }
}

function LinkField({ label, value, extra }: { label: string; value: string | null; extra?: React.ReactNode }) {
  return (
    <div>
      <p className={LABEL_CLASS}>{label}</p>
      <p className="mt-1 break-all text-sm">
        {value ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-amo-lime hover:underline">
            {value}
          </a>
        ) : (
          <span className="text-ink">—</span>
        )}
      </p>
      {extra}
    </div>
  );
}

export default async function AffiliateProgramDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ shortioError?: string }>;
}) {
  const { id } = await params;
  const { shortioError } = await searchParams;
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  const { program, hour12 } = await withScopedPrismaClient(async (db) => {
    const program = await db.affiliateProgram.findUnique({
      where: { id },
      include: { emailLinks: { orderBy: { messageDate: "desc" } } },
    });
    const hour12 = await getHour12(session, db);
    return { program, hour12 };
  });
  if (!program) notFound();

  const isAdmin = session?.user.role === "ADMIN";
  const bucket = classifyAffiliateStatus(program.affiliateStatus);
  const styles = AFFILIATE_STATUS_STYLES[bucket];
  const hasStats = program.shortioClicks != null || program.shortioClicksFr != null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<HeaderBreadcrumb parts={[{ label: t.marketing.title, href: "/marketing" }, { label: program.name }]} />}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={
          <>
            <Link href={`/marketing/programs/${program.id}/edit`} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
              {t.common.edit}
            </Link>
            <DeleteAffiliateProgramButton programId={program.id} lang={lang} />
          </>
        }
      />

      {shortioError && <p className="text-sm text-red-600">{t.marketing.shortioErrorBanner(shortioError)}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-xl font-semibold text-ink">{program.name}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                {program.affiliateStatus || "—"}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className={LABEL_CLASS}>{t.marketing.affiliateProgramsTitle}</p>
                <p className="mt-1 text-sm text-ink">{tabTitle(program.tab, t)}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.marketing.colType}</p>
                <p className="mt-1 text-sm text-ink">{program.type || "—"}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.marketing.categoryLabel}</p>
                <p className="mt-1 text-sm text-ink">{program.category || "—"}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.marketing.accountPlanLabel}</p>
                <p className="mt-1 text-sm text-ink">{program.accountPlan || "—"}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.marketing.colFollowUp}</p>
                <p className="mt-1 text-sm text-ink">{program.followUpNeeded ? t.marketing.followUpYes : t.marketing.followUpNo}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.marketing.followUpDateLabel}</p>
                <p className="mt-1 text-sm text-ink">{program.followUpDate ? format(program.followUpDate, "PP", { locale: dateLocale }) : "—"}</p>
              </div>

              <LinkField
                label={t.marketing.brandedLinkLabel}
                value={program.brandedLink}
                extra={isAdmin && program.destinationLink && <CreateShortIoLinkButton programId={program.id} variant="default" lang={lang} />}
              />
              <LinkField label={t.marketing.destinationLinkLabel} value={program.destinationLink} />
              <div>
                <p className={LABEL_CLASS}>{t.marketing.shortioCreatedLabel}</p>
                <p className="mt-1 text-sm text-ink">{program.shortioCreated ? t.marketing.yes : t.marketing.no}</p>
              </div>

              <LinkField
                label={t.marketing.frenchSlugLabel}
                value={program.frenchSlug}
                extra={isAdmin && program.frenchLink && <CreateShortIoLinkButton programId={program.id} variant="fr" lang={lang} />}
              />
              <LinkField label={t.marketing.frenchLinkLabel} value={program.frenchLink} />
              <div />

              <LinkField label={t.marketing.applyUrlLabel} value={program.applyUrl} />
              <div>
                <p className={LABEL_CLASS}>{t.marketing.applyPlatformLabel}</p>
                <p className="mt-1 text-sm text-ink">{program.applyPlatform || "—"}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.marketing.hasApiLabel}</p>
                <p className="mt-1 text-sm text-ink">
                  {program.hasApi ? t.marketing.yes : t.marketing.no}
                  {program.hasApi && program.apiKeyEncrypted && (
                    <span className="ml-2 text-xs text-emerald-700">{t.marketing.apiKeySavedShort}</span>
                  )}
                </p>
              </div>
            </div>

            {program.notes && (
              <div className="mt-5 border-t border-card-border pt-4">
                <p className={LABEL_CLASS}>{t.marketing.notesLabel}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{program.notes}</p>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.contactDetail.linkedEmailsTitle}</h2>
            {program.emailLinks.length === 0 ? (
              <p className="mt-2 text-sm text-soft">{t.marketing.noLinkedEmailsYet}</p>
            ) : (
              <ul className="mt-3 divide-y divide-card-border">
                {program.emailLinks.map((link) => (
                  <li key={link.id} className="py-2">
                    {link.gmailLink ? (
                      <a
                        href={link.gmailLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-medium text-ink hover:underline"
                      >
                        {link.subject || "—"}
                      </a>
                    ) : (
                      <span className="block truncate text-sm font-medium text-ink">{link.subject || "—"}</span>
                    )}
                    <p className="truncate text-xs text-soft">
                      {link.fromLabel}
                      {link.messageDate && ` · ${format(link.messageDate, "PP", { locale: dateLocale })}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">{t.marketing.statsTitle}</h2>
          {isAdmin && (program.shortioLinkId || program.shortioLinkIdFr) && (
            <RefreshStatsButton programId={program.id} lang={lang} />
          )}
        </div>
        {!hasStats ? (
          <p className="mt-2 text-sm text-soft">{t.marketing.noStatsYet}</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {program.shortioClicks != null && (
              <div>
                <p className={LABEL_CLASS}>
                  {t.marketing.brandedLinkLabel} · {t.marketing.statsClicks}
                </p>
                <p className="mt-1 text-2xl font-semibold text-ink">{program.shortioClicks}</p>
              </div>
            )}
            {program.shortioClicksFr != null && (
              <div>
                <p className={LABEL_CLASS}>
                  {t.marketing.frenchSlugLabel} · {t.marketing.statsClicks}
                </p>
                <p className="mt-1 text-2xl font-semibold text-ink">{program.shortioClicksFr}</p>
              </div>
            )}
          </div>
        )}
        {program.shortioStatsSyncedAt && (
          <p className="mt-3 text-xs text-soft">
            {t.marketing.statsLastSynced(format(program.shortioStatsSyncedAt, "PPp", { locale: dateLocale }))}
          </p>
        )}
      </section>
    </div>
  );
}
