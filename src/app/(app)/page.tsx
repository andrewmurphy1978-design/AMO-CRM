import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const [contactCount, clientCount, activeProjectCount, openTaskCount, dueSoonTasks, recentActivity, integration] =
    await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { stage: "CLIENT" } }),
      prisma.project.count({ where: { status: "ACTIVE" } }),
      prisma.task.count({ where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } } }),
      prisma.task.findMany({
        where: {
          status: { in: ["TODO", "IN_PROGRESS"] },
          dueDate: { not: null },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
        include: { project: { include: { contact: true } } },
      }),
      prisma.activityLogEntry.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { contact: true, project: true },
      }),
      prisma.integrationSetting.findUnique({ where: { provider: "systeme_io" } }),
    ]);

  const stats = [
    { label: "Total contacts", value: contactCount, href: "/contacts" },
    { label: "Clients", value: clientCount, href: "/contacts?stage=CLIENT" },
    { label: "Active projects", value: activeProjectCount, href: "/projects?status=ACTIVE" },
    { label: "Open tasks", value: openTaskCount, href: "/projects" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overview of your contacts, clients, and active work.
        </p>
      </div>

      {!integration?.apiKeyEncrypted && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your systeme.io account isn&apos;t connected yet.{" "}
          <Link href="/settings" className="font-medium underline">
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
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
            <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Upcoming tasks</h2>
          {dueSoonTasks.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No upcoming tasks with a due date.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {dueSoonTasks.map((task) => (
                <li key={task.id} className="text-sm">
                  <Link
                    href={`/projects/${task.projectId}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {task.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {task.project.name} · {task.project.contact.firstName ?? task.project.contact.email}
                    {task.dueDate && ` · due ${formatDistanceToNow(task.dueDate, { addSuffix: true })}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
          {recentActivity.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No activity yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {recentActivity.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <p className="text-slate-700">{entry.message}</p>
                  <p className="text-xs text-slate-400">
                    {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
