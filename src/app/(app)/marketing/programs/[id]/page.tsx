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
import { statusStyle } from "@/lib/affiliate-status";
import {
  getShortIoConfig,
  getShortIoLinkStatistics,
  isShortIoStatsStale,
  summarizeShortIoStats,
  type ShortIoStatsSummary,
} from "@/lib/shortio";
import PageHeader, { HeaderBreadcrumb } from "../../../page-header";
import Card from "@/components/section-card";
import DeleteAffiliateProgramButton from "../delete-button";
import CreateShortIoLinkButton from "../create-shortio-link-button";
import RefreshStatsButton from "../refresh-stats-button";
import LastSynced from "./last-synced";
import LinkedEmailsList from "../../../linked-emails-list";

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

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Parses "yyyy-mm-dd..." straight out of the string rather than through a
// `Date` — these are calendar-day buckets (midnight UTC), and going through
// `new Date(...)` plus a local getter would shift the day backward for any
// timezone behind UTC (all of North America), turning e.g. "Aug 17" into
// "Aug 16". String slicing keeps the calendar date exactly as Short.io
// reported it, no timezone involved.
function shortDayLabel(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  return `${SHORT_MONTHS[month - 1] ?? ""} ${day}`;
}

function ShortIoStatBlock({ title, summary, t }: { title: string; summary: ShortIoStatsSummary; t: ReturnType<typeof getDict> }) {
  const maxDaily = Math.max(1, ...summary.dailyClicks.map((d) => d.count));
  // Labels every ~5 bars (plus the last one) rather than under every bar —
  // 30 individual labels side by side would just overlap into an unreadable
  // smear at this width.
  const labelEvery = Math.max(1, Math.ceil(summary.dailyClicks.length / 6));
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink">{title}</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className={LABEL_CLASS}>{t.marketing.statsClicks}</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{summary.totalClicks ?? "—"}</p>
        </div>
        <div>
          <p className={LABEL_CLASS}>{t.marketing.statsHumanClicks}</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{summary.humanClicks ?? "—"}</p>
        </div>
      </div>

      {summary.dailyClicks.length > 0 && (
        <div>
          <p className={LABEL_CLASS}>{t.marketing.statsLast30Days}</p>
          <div className="mt-2 flex h-10 items-end gap-0.5">
            {summary.dailyClicks.map((d) => (
              <div
                key={d.date}
                title={`${shortDayLabel(d.date)}: ${d.count}`}
                className="min-h-1 flex-1 rounded-t bg-amo-lime/70"
                style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex gap-0.5">
            {summary.dailyClicks.map((d, i) => {
              const isLast = i === summary.dailyClicks.length - 1;
              const show = i % labelEvery === 0 || isLast;
              return (
                <div key={d.date} className="min-w-0 flex-1 text-center">
                  {show && (
                    <span className={`text-[9px] text-soft ${isLast ? "" : "whitespace-nowrap"}`}>{shortDayLabel(d.date)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {summary.topCountries.length > 0 && (
          <div>
            <p className={LABEL_CLASS}>{t.marketing.statsTopCountries}</p>
            <ul className="mt-1 space-y-0.5 text-sm text-ink">
              {summary.topCountries.map((c) => (
                <li key={c.name} className="flex justify-between gap-2">
                  <span className="truncate">{c.name}</span>
                  <span className="text-ink/60">{c.score}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {summary.topReferrers.length > 0 && (
          <div>
            <p className={LABEL_CLASS}>{t.marketing.statsTopReferrers}</p>
            <ul className="mt-1 space-y-0.5 text-sm text-ink">
              {summary.topReferrers.map((r, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">{r.label || t.marketing.statsDirect}</span>
                  <span className="text-ink/60">{r.score}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {summary.topBrowsers.length > 0 && (
          <div>
            <p className={LABEL_CLASS}>{t.marketing.statsTopBrowsers}</p>
            <ul className="mt-1 space-y-0.5 text-sm text-ink">
              {summary.topBrowsers.map((b) => (
                <li key={b.name} className="flex justify-between gap-2">
                  <span className="truncate">{b.name}</span>
                  <span className="text-ink/60">{b.score}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default async function AffiliateProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  const isAdmin = session?.user.role === "ADMIN";
  // Detailed per-program stats (country/referrer/browser breakdown, daily
  // clicks) are only worth fetching for the one program actually being
  // viewed — the list page's Clicks column is kept fed separately by the
  // batched account-wide sync, which stays limited to totals so it never
  // risks Cloudflare's per-invocation subrequest cap. Re-fetching here is
  // gated on staleness so repeat views of the same program within the
  // window don't re-hit Short.io on every load.
  const { program, hour12 } = await withScopedPrismaClient(async (db) => {
    let program = await db.affiliateProgram.findUnique({
      where: { id },
      include: { emailLinks: { orderBy: { messageDate: "desc" } } },
    });
    const hour12 = await getHour12(session, db);
    if (!program) return { program, hour12 };

    const needsStats = isAdmin && (program.shortioLinkId || program.shortioLinkIdFr) && isShortIoStatsStale(program.shortioStatsSyncedAt);

    if (needsStats) {
      const config = await getShortIoConfig(db);
      if (config) {
        const data: Record<string, unknown> = { shortioStatsSyncedAt: new Date() };
        let changed = false;
        try {
          if (program.shortioLinkId) {
            const stats = await getShortIoLinkStatistics(config.apiKey, [program.shortioLinkId]);
            data.shortioClicks = stats.totalClicks;
            data.shortioStats = stats.raw as object;
            data.shortioLinkId = stats.matchedId;
            changed = true;
          }
          if (program.shortioLinkIdFr) {
            const stats = await getShortIoLinkStatistics(config.apiKey, [program.shortioLinkIdFr]);
            data.shortioClicksFr = stats.totalClicks;
            data.shortioStatsFr = stats.raw as object;
            data.shortioLinkIdFr = stats.matchedId;
            changed = true;
          }
        } catch {
          // Best-effort — an on-open refresh failure just falls back to
          // whatever stats are already on file; the manual "Refresh stats"
          // button still surfaces the actual error if the admin wants it.
        }
        if (changed) {
          program = await db.affiliateProgram.update({
            where: { id: program.id },
            data,
            include: { emailLinks: { orderBy: { messageDate: "desc" } } },
          });
        }
      }
    }

    return { program, hour12 };
  });
  if (!program) notFound();
  const styles = statusStyle(program.affiliateStatus);
  const hasStats = program.shortioClicks != null || program.shortioClicksFr != null;
  const enStats = summarizeShortIoStats(program.shortioStats);
  const frStats = summarizeShortIoStats(program.shortioStatsFr);

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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card color="general" title={t.contactForm.cardGeneralInfo}>
            <div className="grid items-center gap-3 lg:grid-cols-3">
              <div className="flex items-center gap-3">
                {program.iconUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={program.iconUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-contain" />
                )}
                <h1 className="font-display text-xl font-semibold text-ink">{program.name}</h1>
              </div>
              <div />
              <div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                  {program.affiliateStatus || "—"}
                </span>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Row 1: Type, Category, Status Details */}
              <div>
                <p className={LABEL_CLASS}>{t.marketing.colType}</p>
                <p className="mt-1 text-sm text-ink">{tabTitle(program.tab, t)}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.marketing.categoryLabel}</p>
                <p className="mt-1 text-sm text-ink">{program.type || "—"}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.marketing.statusDetailsLabel}</p>
                <p className="mt-1 text-sm text-ink">{program.statusDetails || "—"}</p>
              </div>

              {/* Row 2 shifts to Account/Plan alone since Status moved to the
                  right column — keep it its own row for visual grouping. */}
              <div>
                <p className={LABEL_CLASS}>{t.marketing.accountPlanLabel}</p>
                <p className="mt-1 text-sm text-ink">{program.accountPlan || "—"}</p>
              </div>
              <div />
              <div />

              {/* Row 3: English links + Short.io Link Created */}
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

              {/* Row 4: French links + Follow-up info */}
              <LinkField
                label={t.marketing.frenchSlugLabel}
                value={program.frenchSlug}
                extra={isAdmin && program.frenchLink && <CreateShortIoLinkButton programId={program.id} variant="fr" lang={lang} />}
              />
              <LinkField label={t.marketing.frenchLinkLabel} value={program.frenchLink} />
              <div>
                <p className={LABEL_CLASS}>{t.marketing.colFollowUp}</p>
                <p className="mt-1 text-sm text-ink">{program.followUpNeeded ? t.marketing.followUpYes : t.marketing.followUpNo}</p>
                <p className="mt-1 text-sm text-ink">
                  {program.followUpDate ? format(program.followUpDate, "PP", { locale: dateLocale }) : "—"}
                </p>
              </div>

              {/* Row 5: Where to apply, Application platform, Has its own API */}
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
              <div className="border-t border-card-border pt-4">
                <p className={LABEL_CLASS}>{t.marketing.notesLabel}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{program.notes}</p>
              </div>
            )}
          </Card>

          <Card
            color="statistics"
            title={t.marketing.statsTitle}
            actions={
              isAdmin && (program.shortioLinkId || program.shortioLinkIdFr) ? (
                <RefreshStatsButton programId={program.id} lang={lang} />
              ) : undefined
            }
          >
            {!hasStats ? (
              <p className="text-sm text-soft">{t.marketing.noStatsYet}</p>
            ) : (
              <div className="space-y-6">
                {enStats && <ShortIoStatBlock title={t.marketing.brandedLinkLabel} summary={enStats} t={t} />}
                {frStats && (
                  <div className={enStats ? "border-t border-card-border pt-6" : undefined}>
                    <ShortIoStatBlock title={t.marketing.frenchLinkLabel} summary={frStats} t={t} />
                  </div>
                )}
              </div>
            )}
            {program.shortioStatsSyncedAt && <LastSynced iso={program.shortioStatsSyncedAt.toISOString()} lang={lang} />}
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            color="linkedEmails"
            title={t.contactDetail.linkedEmailsTitle}
            actions={
              program.emailLinks.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold">
                  {program.emailLinks.length}
                </span>
              )
            }
          >
            <LinkedEmailsList
              emailLinks={program.emailLinks.map((link) => ({
                id: link.id,
                gmailThreadId: link.gmailThreadId,
                subject: link.subject,
                fromLabel: link.fromLabel,
                messageDate: link.messageDate ? link.messageDate.toISOString() : null,
                gmailLink: link.gmailLink,
              }))}
              noLinkedEmailsLabel={t.marketing.noLinkedEmailsYet}
              dateLocale={dateLocale}
              intlLocale={intlLocale}
              hour12={hour12}
              emailDialogLabels={t.emailDialog}
              emailComposeLabels={t.emailCompose}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
