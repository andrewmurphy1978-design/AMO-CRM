import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateTask } from "@/actions/tasks";
import TaskForm from "../../../task-form";

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;

  // Sequential, not Promise.all — see src/lib/prisma.ts for why.
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  if (!task || task.projectId !== id) notFound();

  const boundUpdate = updateTask.bind(null, task.id);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-ink">Edit task</h1>
      <div className="mt-6 rounded-lg border border-card-border bg-card-bg p-6 shadow-sm">
        <TaskForm action={boundUpdate} projectId={id} defaultValues={task} users={users} submitLabel="Save changes" />
      </div>
    </div>
  );
}
