import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow } from "date-fns";

const STAT_ICONS = {
  contacts: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
    />
  ),
  clients: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H11.25m4.5 0v3.75m0-3.75h-4.5m4.5 0V6.375c0-.621-.504-1.125-1.125-1.125H6.375c-.621 0-1.125.504-1.125 1.125v9.375m11.25 0h1.5m-1.5 0h-9"
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

export default async function DashboardPage() {
  // Sequential, not Promise.all: Cloudflare Hyperdrive hangs rather than
  // queues when a single cold request tries to open several new database
  // connections at once. See src/lib/prisma.ts.
  const contactCount = await prisma.contact.count();
  const clientCount = await prisma.contact.count({ where: { stage: "CLIENT" } });
  const activeProjectCount = await prisma.project.count({ where: { status: "ACTIVE" } });
  const openTaskCount = await prisma.task.count({
    where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
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

  const stats = [
    { label: "Total contacts", value: contactCount, href: "/contacts", icon: STAT_ICONS.contacts, color: "lime" },
    { label: "Clients", value: clientCount, href: "/contacts?stage=CLIENT", icon: STAT_ICONS.clients, color: "teal" },
    {
      label: "Active projects",
      value: activeProjectCount,
      href: "/projects?status=ACTIVE",
      icon: STAT_ICONS.projects,
      color: "blue",
    },
    { label: "Open tasks", value: openTaskCount, href: "/projects", icon: STAT_ICONS.tasks, color: "gold" },
  ] as const;

  const colorClasses = {
    lime: "bg-amo-lime/15 text-amo-lime",
    teal: "bg-amo-teal/15 text-amo-teal",
    blue: "bg-amo-blue/15 text-amo-blue",
    gold: "bg-amo-gold/15 text-amo-gold",
  } as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-amo-white">Dashboard</h1>
        <p className="mt-1 text-sm text-amo-muted">
          Overview of your contacts, clients, and active work.
        </p>
      </div>

      {!integration?.apiKeyEncrypted && (
        <div className="rounded-xl border border-amo-gold/30 bg-amo-gold/10 px-4 py-3 text-sm text-amo-gold">
          Your systeme.io account isn&apos;t connected yet.{" "}
          <Link href="/settings" className="font-semibold underline">
            Connect it in Settings
          </Link>{" "}
          to sync your contacts and tags automatically.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group relative overflow-hidden rounded-2xl border border-amo-border bg-amo-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-amo-lime/40 hover:shadow-[0_12px_28px_rgba(46,204,113,0.15)]"
          >
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${colorClasses[stat.color]}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                {stat.icon}
              </svg>
            </div>
            <p className="mt-4 font-display text-2xl font-semibold text-amo-white">{stat.value}</p>
            <p className="mt-1 text-sm text-amo-muted">{stat.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-amo-border bg-amo-card p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <h2 className="font-display text-sm font-semibold text-amo-white">Upcoming tasks</h2>
          {dueSoonTasks.length === 0 ? (
            <p className="mt-3 text-sm text-amo-muted">No upcoming tasks with a due date.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {dueSoonTasks.map((task) => (
                <li key={task.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amo-teal" />
                  <div>
                    <Link
                      href={`/projects/${task.projectId}`}
                      className="font-medium text-amo-white hover:text-amo-lime hover:underline"
                    >
                      {task.title}
                    </Link>
                    <p className="text-xs text-amo-muted">
                      {task.project.name} · {task.project.contact.firstName ?? task.project.contact.email}
                      {task.dueDate && ` · due ${formatDistanceToNow(task.dueDate, { addSuffix: true })}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-amo-border bg-amo-card p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
          <h2 className="font-display text-sm font-semibold text-amo-white">Recent activity</h2>
          {recentActivity.length === 0 ? (
            <p className="mt-3 text-sm text-amo-muted">No activity yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amo-blue" />
                  <div>
                    <p className="text-amo-white">{entry.message}</p>
                    <p className="text-xs text-amo-muted">
                      {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
