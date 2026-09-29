import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_CHART_COLOR,
  getLatestSocialSnapshots,
  getSocialSnapshotHistory,
  getSocialLinks,
  summarizeSocialSnapshots,
  type SocialPlatform,
} from "@/lib/social";
import {
  SOCIAL_CARD_ACCENT_BAR,
  SOCIAL_CARD_ACCENT_DOT,
  SOCIAL_CARD_BG,
  SOCIAL_GROWTH_COLORS,
  SOCIAL_METRIC_COLORS,
} from "../social-summary-colors";
import SocialIcon from "../social-icon";
import SocialCard from "../social-card";
import SummarySubCard from "../summary-sub-card";
import PageHeader from "../page-header";
import TrendChart, { type TrendSeries } from "./trend-chart";
import BarChart, { type BarDatum } from "./bar-chart";
import SocialPageLinks from "./social-page-links";

// A single hard-coded "external tool" link (unlike the per-platform
// profile links below, which are account-specific and editable in
// Settings) — Buffer's own analytics dashboard is the same URL for every
// Buffer user, so there's nothing for an admin to configure here.
const BUFFER_ANALYTICS_URL = "https://publish.buffer.com/analytics";

export default async function SocialAnalyticsPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  // One shared client — see src/lib/prisma.ts for why.
  const { snapshots, history, links, hour12 } = await withScopedPrismaClient(async (db) => {
    const snapshots = await getLatestSocialSnapshots(db);
    const history = await getSocialSnapshotHistory(db, 30);
    const links = await getSocialLinks(db);
    const hour12 = await getHour12(session, db);
    return { snapshots, history, links, hour12 };
  });

  const summary = summarizeSocialSnapshots(snapshots);
  const growth = summary.followersGrowth;
  const growthColor =
    growth > 0 ? SOCIAL_GROWTH_COLORS.positive : growth < 0 ? SOCIAL_GROWTH_COLORS.negative : SOCIAL_GROWTH_COLORS.flat;
  const growthValue = growth > 0 ? `+${growth.toLocaleString()}` : growth.toLocaleString();

  const platformNames: Record<SocialPlatform, string> = {
    facebook: t.dashboard.socialFacebook,
    instagram: t.dashboard.socialInstagram,
    linkedin: t.dashboard.socialLinkedin,
    youtube: t.dashboard.socialYoutube,
    tiktok: t.dashboard.socialTiktok,
    x: t.dashboard.socialX,
  };

  const socialLabels = {
    title: t.dashboard.socialTitle,
    empty: t.dashboard.socialEmpty,
    followers: t.dashboard.socialFollowers,
    engagement: t.dashboard.socialEngagement,
    views: t.dashboard.socialViews,
    languageEn: t.dashboard.socialLanguageEn,
    languageFr: t.dashboard.socialLanguageFr,
    updatedPrefix: t.dashboard.updatedPrefix,
    syncNow: t.automations.syncNow,
    syncing: t.automations.syncing,
    statLabels: {
      postCount: t.dashboard.socialStatPostCount,
      reactions: t.dashboard.socialStatReactions,
      comments: t.dashboard.socialStatComments,
      reach: t.dashboard.socialStatReach,
      impressions: t.dashboard.socialStatImpressions,
      likes: t.dashboard.socialStatLikes,
      shares: t.dashboard.socialStatShares,
      saves: t.dashboard.socialStatSaves,
    },
    platformNames,
  };

  // One line chart per platform, EN + FR as two series — built from the
  // shared history rows rather than a per-platform query (see
  // getSocialSnapshotHistory's own comment).
  const allDateKeys = Array.from(new Set(history.map((h) => h.dateKey))).sort();
  const trendByPlatform = new Map<SocialPlatform, TrendSeries[]>();
  for (const platform of SOCIAL_PLATFORMS) {
    const enValues = new Map<string, number>();
    const frValues = new Map<string, number>();
    for (const point of history) {
      if (point.platform !== platform || point.followers === null) continue;
      (point.language === "EN" ? enValues : frValues).set(point.dateKey, point.followers);
    }
    trendByPlatform.set(platform, [
      { label: t.dashboard.socialLanguageEn, color: "#0ea5e9", values: enValues },
      { label: t.dashboard.socialLanguageFr, color: "#db2777", values: frValues },
    ]);
  }

  function totalsByPlatform(pick: "followers" | "engagement" | "views"): BarDatum[] {
    const totals = new Map<SocialPlatform, number>();
    for (const snapshot of snapshots) {
      const value = snapshot[pick];
      if (value === null) continue;
      totals.set(snapshot.platform, (totals.get(snapshot.platform) ?? 0) + value);
    }
    return SOCIAL_PLATFORMS.filter((p) => totals.has(p)).map((platform) => ({
      key: platform,
      label: platformNames[platform],
      value: totals.get(platform) ?? 0,
      color: SOCIAL_CHART_COLOR[platform],
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <SocialIcon />
            <span className="truncate">{t.socialAnalyticsPage.title}</span>
          </span>
        }
        hour12={hour12}
        lang={lang}
        location={t.dashboard.myLocation}
        actions={
          <a
            href={BUFFER_ANALYTICS_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={t.socialAnalyticsPage.bufferAnalyticsLink}
            aria-label={t.socialAnalyticsPage.bufferAnalyticsLink}
            className="btn-primary flex items-center justify-center rounded-lg p-1.5 shadow-sm sm:justify-start sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm sm:font-semibold"
          >
            {/* Same Add-button convention as Contacts/Email/Calendar: a
                bare square icon on mobile, label restored at sm+. */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h6m0 0v6m0-6L10 16m-5 3h14a1 1 0 0 0 1-1v-6M4 10V5a1 1 0 0 1 1-1h6" />
            </svg>
            <span className="hidden sm:inline">{t.socialAnalyticsPage.bufferAnalyticsLink}</span>
          </a>
        }
      />

      <div className={`relative overflow-hidden rounded-2xl border border-card-border p-3 shadow-sm sm:p-5 ${SOCIAL_CARD_BG}`}>
        <div className={`absolute inset-x-0 top-0 h-[3px] ${SOCIAL_CARD_ACCENT_BAR}`} />
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <SummarySubCard
            bg={SOCIAL_CARD_ACCENT_DOT}
            text="text-white"
            value={summary.totalFollowers.toLocaleString()}
            label={t.dashboard.socialSummaryFollowersLabel}
          />
          <SummarySubCard bg={growthColor.bg} text={growthColor.text} value={growthValue} label={t.dashboard.socialSummaryGrowthLabel} />
          <SummarySubCard
            bg={SOCIAL_METRIC_COLORS.engagement.bg}
            text={SOCIAL_METRIC_COLORS.engagement.text}
            value={summary.totalEngagement.toLocaleString()}
            label={t.dashboard.socialSummaryEngagementLabel}
          />
          <SummarySubCard
            bg={SOCIAL_METRIC_COLORS.views.bg}
            text={SOCIAL_METRIC_COLORS.views.text}
            value={summary.totalViews.toLocaleString()}
            label={t.dashboard.socialSummaryViewsLabel}
          />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">{t.socialAnalyticsPage.followersTrendTitle}</h2>
        <div className="mt-3 flex items-center gap-4 text-xs text-soft">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#0ea5e9" }} />
            {t.dashboard.socialLanguageEn}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#db2777" }} />
            {t.dashboard.socialLanguageFr}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SOCIAL_PLATFORMS.map((platform) => (
            <div key={platform}>
              <p className="text-xs font-semibold uppercase tracking-wide text-soft">{platformNames[platform]}</p>
              <TrendChart
                dateKeys={allDateKeys}
                series={trendByPlatform.get(platform) ?? []}
                emptyLabel={t.socialAnalyticsPage.chartEmptyLabel}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <h2 className="font-display text-base font-semibold text-ink">{t.socialAnalyticsPage.followersByPlatformTitle}</h2>
          <div className="mt-3">
            <BarChart data={totalsByPlatform("followers")} emptyLabel={t.socialAnalyticsPage.barEmptyLabel} />
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <h2 className="font-display text-base font-semibold text-ink">{t.socialAnalyticsPage.engagementByPlatformTitle}</h2>
          <div className="mt-3">
            <BarChart data={totalsByPlatform("engagement")} emptyLabel={t.socialAnalyticsPage.barEmptyLabel} />
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <h2 className="font-display text-base font-semibold text-ink">{t.socialAnalyticsPage.viewsByPlatformTitle}</h2>
          <div className="mt-3">
            <BarChart data={totalsByPlatform("views")} emptyLabel={t.socialAnalyticsPage.barEmptyLabel} />
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">{t.socialAnalyticsPage.yourPagesTitle}</h2>
          <a href="/settings" className="text-xs font-semibold text-amo-lime hover:underline">
            {t.socialAnalyticsPage.manageLinksLink}
          </a>
        </div>
        <div className="mt-3">
          <SocialPageLinks
            links={links}
            platformNames={platformNames}
            languageEn={t.dashboard.socialLanguageEn}
            languageFr={t.dashboard.socialLanguageFr}
            notSetLabel={t.socialAnalyticsPage.linkNotSet}
          />
        </div>
      </div>

      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{t.socialAnalyticsPage.detailedTitle}</h2>
        <div className="mt-3">
          <SocialCard snapshots={snapshots} labels={socialLabels} isAdmin={session?.user.role === "ADMIN"} dateLocale={dateLocale} />
        </div>
      </div>
    </div>
  );
}
