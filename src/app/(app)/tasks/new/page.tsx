import { withScopedPrismaClient } from "@/lib/prisma";
import { createTaskAndRedirect } from "@/actions/tasks";
import TaskForm from "../task-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;
  const lang = await getLang();
  const t = getDict(lang);

  // One shared client — see src/lib/prisma.ts for why.
  const { projects, users } = await withScopedPrismaClient(async (db) => {
    const projects = await db.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { contact: true, phases: { orderBy: { order: "asc" } } },
    });
    const users = await db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    return { projects, users };
  });

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-ink">{t.newTaskPage.title}</h1>
      <div className="mt-6 rounded-lg border border-card-border bg-card-bg p-6 shadow-sm">
        <TaskForm
          action={createTaskAndRedirect}
          defaultValues={{ projectId }}
          submitLabel={t.taskForm.createTask}
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
