import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow } from "date-fns";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import WorldClocks from "./world-clocks";
import ComingSoonCard from "./coming-soon-card";

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
    take: 8,
  });

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

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Main column: personal + professional feed, top to bottom. */}
        <div className="space-y-6">
          <ComingSoonCard title={t.dashboard.emailTitle} description={t.dashboard.emailComingSoon} />

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

          <ComingSoonCard title={t.dashboard.calendarTitle} description={t.dashboard.calendarComingSoon} />

          <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.dashboard.automationsTitle}</h2>
            {recentRuns.length === 0 ? (
              <p className="mt-3 text-sm text-soft">{t.dashboard.noAutomationRuns}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {recentRuns.map((run) => (
                  <li key={run.id} className="flex items-start gap-3 text-sm">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${run.status === "error" ? "bg-red-500" : "bg-emerald-500"}`}
                    />
                    <div className="flex-1">
                      <p className="text-ink">
                        <span className="font-medium">{run.source === "make" ? "Make" : "Zapier"}</span>
                        {run.name ? ` · ${run.name}` : ""}
                      </p>
                      {run.message && <p className="text-xs text-soft">{run.message}</p>}
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-xs font-medium ${run.status === "error" ? "text-red-600" : "text-emerald-700"}`}
                      >
                        {run.status === "error" ? t.dashboard.automationError : t.dashboard.automationSuccess}
                      </span>
                      <p className="text-xs text-soft">
                        {formatDistanceToNow(run.occurredAt, { addSuffix: true, locale: dateLocale })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ComingSoonCard title={t.dashboard.socialTitle} description={t.dashboard.socialComingSoon} />
        </div>

        {/* Right column: general info. */}
        <div className="space-y-6">
          <ComingSoonCard title={t.dashboard.weatherTitle} description={t.dashboard.weatherComingSoon} />
          <WorldClocks title="World clocks" />
          <ComingSoonCard title={t.dashboard.newsTitle} description={t.dashboard.newsComingSoon} />
          <ComingSoonCard title={t.dashboard.marketsTitle} description={t.dashboard.marketsComingSoon} />
        </div>
      </div>
    </div>
  );
}
