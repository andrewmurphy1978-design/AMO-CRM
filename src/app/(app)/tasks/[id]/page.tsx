import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { withScopedPrismaClient } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import DeleteTaskButton from "./delete-button";
import PageHeader, { HeaderBreadcrumb } from "../../page-header";

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-black/5 text-soft",
  MEDIUM: "bg-sky-50 text-sky-700",
  HIGH: "bg-amber-50 text-amber-700",
  URGENT: "bg-red-50 text-red-600",
};

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const session = await auth();

  // One shared client for both reads below — see the equivalent comment in
  // contacts/[id]/page.tsx for why (Error 1102 risk from separate raw
  // `prisma` property accesses).
  const { task, hour12 } = await withScopedPrismaClient(async (db) => {
    const task = await db.task.findUnique({
      where: { id },
      include: {
        project: { include: { contact: true } },
        phase: true,
        assignee: true,
      },
    });
    const hour12 = await getHour12(session, db);
    return { task, hour12 };
  });

  if (!task) notFound();

  const clientName =
    [task.project.contact.firstName, task.project.contact.lastName].filter(Boolean).join(" ") ||
    task.project.contact.email;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={
          <HeaderBreadcrumb
            parts={[
              { label: task.title },
              { label: task.project.name, href: `/projects/${task.project.id}` },
              { label: clientName, href: `/contacts/${task.project.contact.id}` },
            ]}
          />
        }
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
      />

      <Link href="/tasks" className="text-sm text-soft hover:underline">
        ← {t.taskDetail.backToTasks}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-soft">
            <span>{t.taskStatuses[task.status]}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[task.priority]}`}>
              {t.priorities[task.priority]}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/tasks/${task.id}/edit`}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
          >
            {t.taskDetail.edit}
          </Link>
          <DeleteTaskButton taskId={task.id} projectId={task.project.id} lang={lang} />
        </div>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-soft">{t.taskDetail.fieldClient}</dt>
            <dd className="text-ink">
              <Link href={`/contacts/${task.project.contact.id}`} className="hover:underline">
                {[task.project.contact.firstName, task.project.contact.lastName].filter(Boolean).join(" ") ||
                  task.project.contact.email}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-soft">{t.taskDetail.fieldPhase}</dt>
            <dd className="text-ink">{task.phase?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-soft">{t.taskDetail.fieldAssignee}</dt>
            <dd className="text-ink">{task.assignee?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-soft">{t.taskDetail.fieldStartDate}</dt>
            <dd className="text-ink">{task.startDate ? format(task.startDate, "MMMM d, yyyy", { locale: dateLocale }) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-soft">{t.taskDetail.fieldDueDate}</dt>
            <dd className="text-ink">{task.dueDate ? format(task.dueDate, "MMMM d, yyyy", { locale: dateLocale }) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-soft">{t.taskDetail.fieldCompletedAt}</dt>
            <dd className="text-ink">{task.completedAt ? format(task.completedAt, "MMMM d, yyyy", { locale: dateLocale }) : "—"}</dd>
          </div>
        </dl>

        {task.description && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{t.taskDetail.description}</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{task.description}</p>
          </div>
        )}
      </section>
    </div>
  );
}
