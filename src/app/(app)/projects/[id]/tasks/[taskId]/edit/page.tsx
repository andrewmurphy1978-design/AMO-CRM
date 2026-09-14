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

  const [task, users] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId } }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!task || task.projectId !== id) notFound();

  const boundUpdate = updateTask.bind(null, task.id);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Edit task</h1>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <TaskForm action={boundUpdate} projectId={id} defaultValues={task} users={users} submitLabel="Save changes" />
      </div>
    </div>
  );
}
