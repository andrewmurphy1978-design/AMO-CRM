import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow, format, isToday, isYesterday, type Locale } from "date-fns";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getWeather, DEFAULT_WEATHER_COORDS } from "@/lib/weather";
import { getNewsDigest } from "@/lib/news";
import { getMarketsSnapshot } from "@/lib/markets";
import WorldClocks from "./world-clocks";
import ComingSoonCard from "./coming-soon-card";
import WeatherCard from "./weather-card";
import NewsCard from "./news-card";
import MarketsCard from "./markets-card";
import type { AutomationRun } from "@prisma/client";

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
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  const sevenDaysAgo = daysFromNow(-7);
  const sevenDaysFromNow = daysFromNow(7);

  // Sequential, not Promise.all: Cloudflare Hyperdrive hangs rather than
  // queues when a single cold request tries to open several new database
  // connections at once. See src/lib/prisma.ts.
  const contactCount = await prisma.contact.count();
  const clientCount = await prisma.contact.count({ where: { stage: "CLIENT" } });
  const newContactCount = await prisma.contact.count({ where: { createdAt: { gte: sevenDaysAgo } } });
  const activeProjectCount = await prisma.project.count({ where: { status: "ACTIVE" } });
  const openTaskCount = await prisma.task.count({
    where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
  });
  const dueSoonTaskCount = await prisma.task.count({
    where: {
      status: { in: ["TODO", "IN_PROGRESS"] },
      dueDate: { not: null, lte: sevenDaysFromNow },
    },
  });
  const dueSoonTasks = await prisma.task.findMany({
    where: {
      status: { in: ["TODO", "IN_PROGRESS"] },
      dueDate: { not: null },
    },
    orderBy: { dueDate: "asc" },
    take: 5,
    include: { project: { include: { contact: true } } },
  });
  const activeProjects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    take: 5,
    include: { contact: true },
  });
  const recentActivity = await prisma.activityLogEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { contact: true, project: true },
  });
  const integration = await prisma.integrationSetting.findUnique({
    where: { provider: "systeme_io" },
  });
  const recentRuns = await prisma.automationRun.findMany({
    orderBy: { occurredAt: "desc" },
    take: 30,
  });
  const automationEntries = groupAutomationRuns(recentRuns).slice(0, 8);

  // Plain external HTTP fetches, not Prisma/Hyperdrive calls, so unlike the
  // queries above these are safe to run concurrently.
  const [initialWeather, initialNews, initialMarkets] = await Promise.all([
    getWeather(DEFAULT_WEATHER_COORDS.lat, DEFAULT_WEATHER_COORDS.lon),
    getNewsDigest(lang),
    getMarketsSnapshot(),
  ]);

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
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t.dashboard.title}</h1>
        <p className="mt-1 text-sm text-soft">{t.dashboard.subtitle}</p>
      </div>

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
          <ComingSoonCard title={t.dashboard.emailTitle} description={t.dashboard.emailComingSoon} />

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
          <ComingSoonCard title={t.dashboard.calendarTitle} description={t.dashboard.calendarComingSoon} />

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

          <ComingSoonCard title={t.dashboard.socialTitle} description={t.dashboard.socialComingSoon} />
        </div>

        {/* Right column: general info. */}
        <div className="space-y-6">
          <WeatherCard initial={initialWeather} lang={lang} labels={weatherLabels} />
          <WorldClocks title="World clocks" />
          <NewsCard initial={initialNews} lang={lang} labels={newsLabels} />
          <MarketsCard initial={initialMarkets} labels={marketsLabels} />
        </div>
      </div>
    </div>
  );
}
