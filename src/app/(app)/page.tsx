import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { formatDistanceToNow, format, isToday, isYesterday, type Locale } from "date-fns";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import WorldClocks from "./world-clocks";
import PageHeader from "./page-header";
import CardSkeleton from "./card-skeleton";
import WeatherCardServer from "./weather-card-server";
import NewsCardServer from "./news-card-server";
import MarketsCardServer from "./markets-card-server";
import EmailCard from "./email-card";
import CalendarCardServer from "./calendar-card-server";
import { getCachedInbox, getScreeningExtras, type EmailScreeningPayload } from "@/lib/email-inbox";
import SocialCard from "./social-card";
import { getValidAccessToken } from "@/lib/google";
import { getLatestSocialSnapshots } from "@/lib/social";
import { getHour12 } from "@/lib/time-format";
import type { AutomationRun } from "@prisma/client";

// Same full lockup used in the sidebar's expanded state elsewhere — the
// Dashboard's own sidebar entry hides it (see Sidebar's hideLogo prop) and
// shows it here in the header instead.
const AMO_LOGO_URL =
  "https://d1yei2z3i6k35z.cloudfront.net/18410699/6a596ef4e08523.10636812_AMOBadgeTransparentwithAMOonly.png";

// "about 8 hours ago" is vague for something you'd want to check against a
// posting schedule — this gives "Today at 3:15 PM" / "Yesterday at 9:00 AM" /
// "Sep 12 at 9:00 AM" instead.
function formatSmartDateTime(date: Date, dateLocale: Locale | undefined, t: ReturnType<typeof getDict>): string {
  const time = format(date, "p", { locale: dateLocale });
  if (isToday(date)) return t.dashboard.todayAt(time);
  if (isYesterday(date)) return t.dashboard.yesterdayAt(time);
  return t.dashboard.dateAt(format(date, "MMM d", { locale: dateLocale }), time);
}

type AutomationEntry =
  | { kind: "run"; run: AutomationRun }
  | { kind: "successGroup"; source: string; name: string | null; count: number; latest: Date };

// Make's execution history can't tell us which specific post/platform ran
// (the scenario doesn't log that anywhere once a queue item is processed —
// see chat), so every successful run currently looks identical: the same
// scenario name over and over. Rather than list "Social Media Poster —
// Success" a dozen times, consecutive successful runs of the same
// automation collapse into one line; failures always stay individual since
// each one is actually worth looking at.
function groupAutomationRuns(runs: AutomationRun[]): AutomationEntry[] {
  const entries: AutomationEntry[] = [];
  for (const run of runs) {
    if (run.status === "error") {
      entries.push({ kind: "run", run });
      continue;
    }
    const last = entries[entries.length - 1];
    if (last?.kind === "successGroup" && last.source === run.source && last.name === run.name) {
      last.count += 1;
      if (run.occurredAt > last.latest) last.latest = run.occurredAt;
      continue;
    }
    entries.push({ kind: "successGroup", source: run.source, name: run.name, count: 1, latest: run.occurredAt });
  }
  return entries;
}

const STAT_ICONS = {
  contacts: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
    />
  ),
  projects: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-19.5 0v6a2.25 2.25 0 0 0 2.25 2.25h15a2.25 2.25 0 0 0 2.25-2.25v-6m-19.5 0h19.5M12 6.75h.008v.008H12V6.75Z"
    />
  ),
  tasks: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  ),
} as const;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export default async function DashboardPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  const sevenDaysAgo = daysFromNow(-7);
  const sevenDaysFromNow = daysFromNow(7);

  // One shared client for every dashboard read below (counts, lists,
  // Google's token, the social snapshots loop, the user's time format) —
  // the `prisma` proxy in src/lib/prisma.ts opens a brand-new client (and,
  // under Cloudflare Workers, a brand-new pooled connection) on every
  // single property access, so calling it 20+ times in one page render
  // piles up enough fresh-connection overhead in one Worker invocation to
  // trip Cloudflare's Error 1102 resource-limit page. withScopedPrismaClient
  // builds exactly one client and reuses it for the whole render instead —
  // same fix already used for the systeme.io/Buffer/Make bulk syncs.
  const {
    contactCount,
    clientCount,
    newContactCount,
    activeProjectCount,
    openTaskCount,
    dueSoonTaskCount,
    dueSoonTasks,
    activeProjects,
    recentActivity,
    integration,
    recentRuns,
    googleAccessToken,
    socialSnapshots,
    hour12,
    emailInitialData,
  } = await withScopedPrismaClient(async (db) => {
    const contactCount = await db.contact.count();
    const clientCount = await db.contact.count({ where: { stage: "CLIENT" } });
    const newContactCount = await db.contact.count({ where: { createdAt: { gte: sevenDaysAgo } } });
    const activeProjectCount = await db.project.count({ where: { status: "ACTIVE" } });
    const openTaskCount = await db.task.count({
      where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
    });
    const dueSoonTaskCount = await db.task.count({
      where: {
        status: { in: ["TODO", "IN_PROGRESS"] },
        dueDate: { not: null, lte: sevenDaysFromNow },
      },
    });
    const dueSoonTasks = await db.task.findMany({
      where: {
        status: { in: ["TODO", "IN_PROGRESS"] },
        dueDate: { not: null },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { project: { include: { contact: true } } },
    });
    const activeProjects = await db.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
      take: 5,
      include: { contact: true },
    });
    const recentActivity = await db.activityLogEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { contact: true, project: true },
    });
    const integration = await db.integrationSetting.findUnique({
      where: { provider: "systeme_io" },
    });
    const recentRuns = await db.automationRun.findMany({
      orderBy: { occurredAt: "desc" },
      take: 30,
    });
    const googleAccessToken = session ? await getValidAccessToken(session.user.id, db) : null;
    const socialSnapshots = await getLatestSocialSnapshots(db);
    const hour12 = await getHour12(session, db);

    // Reads the same cached inbox snapshot the Email page maintains — no
    // live Gmail/Claude call here, just a DB read, so this can share this
    // block's one connection instead of the email card doing its own
    // scoped read from inside a concurrently-rendered Suspense boundary
    // (which is exactly the pattern that trips Cloudflare's Error 1102:
    // two Suspense children each opening their own connection at once).
    const emailInitialData: EmailScreeningPayload | null =
      googleAccessToken && session
        ? await (async () => {
            const snapshot = await getCachedInbox(db, session.user.id);
            if (!snapshot) return null;
            const extras = await getScreeningExtras(db, snapshot, session.user.id);
            return { ...snapshot, ...extras };
          })()
        : null;

    return {
      contactCount,
      clientCount,
      newContactCount,
      activeProjectCount,
      openTaskCount,
      dueSoonTaskCount,
      dueSoonTasks,
      activeProjects,
      recentActivity,
      integration,
      recentRuns,
      googleAccessToken,
      socialSnapshots,
      hour12,
      emailInitialData,
    };
  });
  const automationEntries = groupAutomationRuns(recentRuns).slice(0, 8);

  const weatherLabels = {
    title: t.dashboard.weatherTitle,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
    updatedPrefix: t.dashboard.updatedPrefix,
    humidity: t.dashboard.weatherHumidity,
    wind: t.dashboard.weatherWind,
    high: t.dashboard.weatherHigh,
    low: t.dashboard.weatherLow,
    feelsLike: t.dashboard.weatherFeelsLike,
    unavailable: t.dashboard.weatherUnavailable,
  };
  const newsLabels = {
    title: t.dashboard.newsTitle,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
    unavailable: t.dashboard.newsUnavailable,
    categories: {
      local: t.dashboard.newsCategoryLocal,
      montreal: t.dashboard.newsCategoryMontreal,
      quebec: t.dashboard.newsCategoryQuebec,
      canada: t.dashboard.newsCategoryCanada,
      us: t.dashboard.newsCategoryUs,
      europe: t.dashboard.newsCategoryEurope,
      world: t.dashboard.newsCategoryWorld,
    },
  };
  const marketsLabels = {
    title: t.dashboard.marketsTitle,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
    unavailable: t.dashboard.marketsUnavailable,
    currencies: t.dashboard.marketsCurrencies,
    indices: t.dashboard.marketsIndices,
    commodities: t.dashboard.marketsCommodities,
    crypto: t.dashboard.marketsCrypto,
  };

  const emailLabels = {
    title: t.dashboard.emailTitle,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
    screening: t.dashboard.emailScreening,
    notConnected: t.dashboard.emailNotConnected,
    connectInSettings: t.dashboard.emailConnectInSettings,
    noItems: t.dashboard.emailNoItems,
    openInGmail: t.dashboard.openInGmail,
    openIonosWebmail: t.dashboard.openIonosWebmail,
    reply: t.dashboard.emailReply,
    replyAll: t.dashboard.emailReplyAll,
    forward: t.dashboard.emailForward,
    categoryNeedsReply: t.email.categoryNeedsReply,
    categoryNeedsAttention: t.email.categoryNeedsAttention,
    awaitingResponse: t.dashboard.emailAwaitingResponse,
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
    platformNames: {
      facebook: t.dashboard.socialFacebook,
      instagram: t.dashboard.socialInstagram,
      linkedin: t.dashboard.socialLinkedin,
      youtube: t.dashboard.socialYoutube,
      tiktok: t.dashboard.socialTiktok,
      x: t.dashboard.socialX,
    },
  };
  const calendarLabels = {
    title: t.dashboard.calendarTitle,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
    notConnected: t.dashboard.calendarNotConnected,
    connectInSettings: t.dashboard.emailConnectInSettings,
    noEvents: t.dashboard.calendarNoEvents,
    today: t.dashboard.calendarToday,
    tomorrow: t.dashboard.calendarTomorrow,
    openInCalendar: t.dashboard.openInCalendar,
  };

  const stats = [
    {
      label: t.dashboard.statTotalContacts,
      value: contactCount,
      sub: t.dashboard.statContactsSub(clientCount, newContactCount),
      href: "/contacts",
      icon: STAT_ICONS.contacts,
      color: "lime",
    },
    {
      label: t.dashboard.statActiveProjects,
      value: activeProjectCount,
      sub: null,
      href: "/projects?status=ACTIVE",
      icon: STAT_ICONS.projects,
      color: "blue",
    },
    {
      label: t.dashboard.statOpenTasks,
      value: openTaskCount,
      sub: t.dashboard.statTasksSub(dueSoonTaskCount),
      href: "/projects",
      icon: STAT_ICONS.tasks,
      color: "gold",
    },
  ] as const;

  const colorClasses = {
    lime: "bg-emerald-50 text-emerald-700",
    teal: "bg-teal-50 text-teal-700",
    blue: "bg-sky-50 text-sky-700",
    gold: "bg-amber-100 text-amber-700",
  } as const;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t.dashboard.title}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        logoUrl={AMO_LOGO_URL}
      />

      {!integration?.apiKeyEncrypted && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t.dashboard.notConnected}{" "}
          <Link href="/settings" className="font-semibold underline">
            {t.dashboard.connectInSettings}
          </Link>{" "}
          {t.dashboard.connectSuffix}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-amo-lime/40 hover:shadow-[0_12px_28px_rgba(46,204,113,0.15)]"
          >
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${colorClasses[stat.color]}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                {stat.icon}
              </svg>
            </div>
            <p className="mt-4 font-display text-2xl font-semibold text-ink">{stat.value}</p>
            <p className="mt-1 text-sm text-soft">{stat.label}</p>
            {stat.sub && <p className="mt-0.5 text-xs text-soft">{stat.sub}</p>}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: email, projects, tasks, activity. */}
        <div className="space-y-6">
          <EmailCard initialData={emailInitialData} connected={googleAccessToken !== null} hour12={hour12} lang={lang} labels={emailLabels} />

          <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.dashboard.dashboardProjectsTitle}</h2>
            {activeProjects.length === 0 ? (
              <p className="mt-3 text-sm text-soft">{t.dashboard.noActiveProjects}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {activeProjects.map((project) => (
                  <li key={project.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amo-lime" />
                    <div>
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-ink hover:text-emerald-700 hover:underline"
                      >
                        {project.name}
                      </Link>
                      <p className="text-xs text-soft">
                        {project.contact.firstName ?? project.contact.email}
                        {project.dueDate && ` · ${t.dashboard.due} ${formatDistanceToNow(project.dueDate, { addSuffix: true, locale: dateLocale })}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.dashboard.upcomingTasks}</h2>
            {dueSoonTasks.length === 0 ? (
              <p className="mt-3 text-sm text-soft">{t.dashboard.noUpcomingTasks}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {dueSoonTasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amo-teal" />
                    <div>
                      <Link
                        href={`/projects/${task.projectId}`}
                        className="font-medium text-ink hover:text-emerald-700 hover:underline"
                      >
                        {task.title}
                      </Link>
                      <p className="text-xs text-soft">
                        {task.project.name} · {task.project.contact.firstName ?? task.project.contact.email}
                        {task.dueDate && ` · ${t.dashboard.due} ${formatDistanceToNow(task.dueDate, { addSuffix: true, locale: dateLocale })}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.dashboard.recentActivity}</h2>
            {recentActivity.length === 0 ? (
              <p className="mt-3 text-sm text-soft">{t.dashboard.noActivity}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amo-blue" />
                    <div>
                      <p className="text-ink">{entry.message}</p>
                      <p className="text-xs text-soft">
                        {formatDistanceToNow(entry.createdAt, { addSuffix: true, locale: dateLocale })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Middle column: calendar, automations, social analytics. */}
        <div className="space-y-6">
          <Suspense fallback={<CardSkeleton title={t.dashboard.calendarTitle} />}>
            <CalendarCardServer accessToken={googleAccessToken} lang={lang} hour12={hour12} labels={calendarLabels} />
          </Suspense>

          <SocialCard
            snapshots={socialSnapshots}
            labels={socialLabels}
            isAdmin={session?.user.role === "ADMIN"}
            dateLocale={dateLocale}
          />

          <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.dashboard.automationsTitle}</h2>
            {automationEntries.length === 0 ? (
              <p className="mt-3 text-sm text-soft">{t.dashboard.noAutomationRuns}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {automationEntries.map((entry) =>
                  entry.kind === "run" ? (
                    <li key={entry.run.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      <div className="flex-1">
                        <p className="text-ink">
                          <span className="font-medium">{entry.run.source === "make" ? "Make" : "Zapier"}</span>
                          {entry.run.name ? ` · ${entry.run.name}` : ""}
                        </p>
                        {entry.run.message && <p className="text-xs text-soft">{entry.run.message}</p>}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-medium text-red-600">{t.dashboard.automationError}</span>
                        <p className="text-xs text-soft">{formatSmartDateTime(entry.run.occurredAt, dateLocale, t)}</p>
                      </div>
                    </li>
                  ) : (
                    <li key={`${entry.source}-${entry.name}-${entry.latest.getTime()}`} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      <div className="flex-1">
                        <p className="text-ink">
                          <span className="font-medium">{entry.source === "make" ? "Make" : "Zapier"}</span>
                          {entry.name ? ` · ${entry.name}` : ""}
                        </p>
                        <p className="text-xs text-soft">{t.dashboard.automationSuccessCount(entry.count)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-medium text-emerald-700">{t.dashboard.automationSuccess}</span>
                        <p className="text-xs text-soft">{formatSmartDateTime(entry.latest, dateLocale, t)}</p>
                      </div>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Right column: general info. Each card fetches real, sometimes
            slow, external data — Suspense lets the rest of the dashboard
            (and the nav switch to get here) render immediately instead of
            waiting on all three. */}
        <div className="space-y-6">
          <Suspense fallback={<CardSkeleton title={t.dashboard.weatherTitle} />}>
            <WeatherCardServer lang={lang} labels={weatherLabels} />
          </Suspense>
          <WorldClocks title="World clocks" hour12={hour12} />
          <Suspense fallback={<CardSkeleton title={t.dashboard.newsTitle} />}>
            <NewsCardServer labels={newsLabels} />
          </Suspense>
          <Suspense fallback={<CardSkeleton title={t.dashboard.marketsTitle} />}>
            <MarketsCardServer labels={marketsLabels} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
