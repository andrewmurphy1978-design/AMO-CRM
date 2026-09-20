import { notFound } from "next/navigation";
import { withScopedPrismaClient } from "@/lib/prisma";
import { updateTask } from "@/actions/tasks";
import TaskForm from "../../task-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lang = await getLang();
  const t = getDict(lang);

  // One shared client — see src/lib/prisma.ts for why.
  const { task, projects, users } = await withScopedPrismaClient(async (db) => {
    const task = await db.task.findUnique({ where: { id } });
    const projects = await db.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { contact: true, phases: { orderBy: { order: "asc" } } },
    });
    const users = await db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    return { task, projects, users };
  });

  if (!task) notFound();

  const boundUpdate = updateTask.bind(null, task.id);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-ink">{t.editTaskPage.title}</h1>
      <div className="mt-6 rounded-lg border border-card-border bg-card-bg p-6 shadow-sm">
        <TaskForm
          action={boundUpdate}
          defaultValues={task}
          submitLabel={t.taskForm.saveChanges}
          lang={lang}
          projects={projects.map((p) => ({
            id: p.id,
            label: `${p.name} — ${[p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") || p.contact.email}`,
            phases: p.phases,
          }))}
          users={users}
        />
      </div>
    </div>
  );
}
