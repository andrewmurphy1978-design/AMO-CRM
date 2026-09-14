import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TaskRow from "./task-row";
import QuickAddTask from "./quick-add-task";
import DeleteProjectButton from "./delete-button";

const STATUS_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      contact: true,
      owner: true,
      tasks: {
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        include: { assignee: true },
      },
    },
  });

  if (!project) notFound();

  const openTasks = project.tasks.filter((t) => t.status !== "DONE");
  const doneTasks = project.tasks.filter((t) => t.status === "DONE");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link href={`/contacts/${project.contact.id}`} className="hover:underline">
              {[project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") ||
                project.contact.email}
            </Link>
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {STATUS_LABELS[project.status]}
            {project.owner && ` · Owner: ${project.owner.name}`}
            {project.dueDate && ` · Due ${new Date(project.dueDate).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/projects/${project.id}/edit`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Edit
          </Link>
          <DeleteProjectButton projectId={project.id} />
        </div>
      </div>

      {project.description && (
        <p className="max-w-3xl whitespace-pre-wrap text-sm text-slate-700">{project.description}</p>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
        <div className="mt-3">
          <QuickAddTask projectId={project.id} />
        </div>

        {openTasks.length === 0 && doneTasks.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No tasks yet.</p>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-slate-100">
              {openTasks.map((task) => (
                <TaskRow key={task.id} task={task} projectId={project.id} />
              ))}
            </ul>
            {doneTasks.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-500">
                  {doneTasks.length} completed
                </summary>
                <ul className="mt-2 divide-y divide-slate-100">
                  {doneTasks.map((task) => (
                    <TaskRow key={task.id} task={task} projectId={project.id} />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}
