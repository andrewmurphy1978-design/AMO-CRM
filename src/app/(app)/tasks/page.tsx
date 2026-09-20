import Link from "next/link";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getHour12 } from "@/lib/time-format";
import PageHeader from "../page-header";

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-black/5 text-soft",
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  BLOCKED: "bg-red-50 text-red-600",
  DONE: "bg-emerald-50 text-emerald-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-black/5 text-soft",
  MEDIUM: "bg-sky-50 text-sky-700",
  HIGH: "bg-amber-50 text-amber-700",
  URGENT: "bg-red-50 text-red-600",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assigneeId?: string }>;
}) {
  const { status, assigneeId } = await searchParams;
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const STATUS_LABELS = t.taskStatuses;

  const where: Prisma.TaskWhereInput = {};
  if (status) where.status = status as Prisma.TaskWhereInput["status"];
  if (assigneeId) where.assigneeId = assigneeId;

  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      include: {
        project: { include: { contact: true } },
        assignee: true,
        phase: true,
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const hour12 = await getHour12(session);

  return (
    <div className="space-y-6">
      <PageHeader title={t.tasksPage.title} hour12={hour12} dateLocale={dateLocale} location={t.dashboard.myLocation} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-soft">{t.tasksPage.shown(tasks.length)}</p>
        <Link href="/tasks/new" className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
          {t.tasksPage.newTask}
        </Link>
      </div>

      <form className="flex flex-wrap gap-3" method="get">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        >
          <option value="">{t.tasksPage.allStatuses}</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="assigneeId"
          defaultValue={assigneeId ?? ""}
          className="rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        >
          <option value="">{t.tasksPage.allAssignees}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
        >
          {t.common.filter}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-card-border bg-black/[0.02] text-left text-xs uppercase tracking-wide text-soft">
            <tr>
              <th className="px-4 py-3">{t.tasksPage.colTitle}</th>
              <th className="px-4 py-3">{t.tasksPage.colProject}</th>
              <th className="px-4 py-3">{t.tasksPage.colStatus}</th>
              <th className="px-4 py-3">{t.tasksPage.colPriority}</th>
              <th className="px-4 py-3">{t.tasksPage.colAssignee}</th>
              <th className="px-4 py-3">{t.tasksPage.colStartDate}</th>
              <th className="px-4 py-3">{t.tasksPage.colDueDate}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {tasks.map((task, i) => (
              <tr key={task.id} className="group relative" style={{ backgroundColor: i % 2 === 0 ? "#f4faf6" : "#7fa898" }}>
                <td className="px-4 py-3">
                  {/* Whole-row-clickable via a stretched link — see the same
                      pattern on the Contacts list page. */}
                  <Link href={`/tasks/${task.id}`} className="relative z-10 font-medium text-ink group-hover:underline">
                    <span className="absolute inset-0 z-0 group-hover:bg-black/5" aria-hidden="true" />
                    {task.title}
                  </Link>
                  {task.phase && <div className="text-xs text-soft">{task.phase.name}</div>}
                </td>
                <td className="px-4 py-3 text-ink/70">
                  <div>{task.project.name}</div>
                  <div className="text-xs text-soft">
                    {[task.project.contact.firstName, task.project.contact.lastName].filter(Boolean).join(" ") ||
                      task.project.contact.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status]}`}>
                    {STATUS_LABELS[task.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[task.priority]}`}>
                    {t.priorities[task.priority as keyof typeof t.priorities]}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink/70">{task.assignee?.name ?? "—"}</td>
                <td className="px-4 py-3 text-ink/70">
                  {task.startDate ? format(task.startDate, "MMMM d, yyyy", { locale: dateLocale }) : "—"}
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {task.dueDate ? format(task.dueDate, "MMMM d, yyyy", { locale: dateLocale }) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && <p className="py-8 text-center text-sm text-soft">{t.tasksPage.noTasksFound}</p>}
      </div>
    </div>
  );
}
