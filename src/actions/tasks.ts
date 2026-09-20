"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";

const TaskSchema = z.object({
  title: z.string().trim().min(1, "Task title is required"),
  projectId: z.string().min(1),
  phaseId: z.string().optional(),
  description: z.string().trim().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  assigneeId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
});

function readTaskForm(formData: FormData) {
  const raw = {
    title: String(formData.get("title") ?? "").trim(),
    projectId: String(formData.get("projectId") ?? ""),
    phaseId: String(formData.get("phaseId") ?? "") || undefined,
    description: String(formData.get("description") ?? "").trim() || undefined,
    status: String(formData.get("status") ?? "TODO"),
    priority: String(formData.get("priority") ?? "MEDIUM"),
    assigneeId: String(formData.get("assigneeId") ?? "") || undefined,
    startDate: String(formData.get("startDate") ?? "") || undefined,
    dueDate: String(formData.get("dueDate") ?? "") || undefined,
  };
  return TaskSchema.parse(raw);
}

export async function createTask(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readTaskForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  await withScopedPrismaClient((db) =>
    db.task.create({
      data: {
        title: data.title,
        projectId: data.projectId,
        phaseId: data.phaseId || null,
        description: data.description,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        completedAt: data.status === "DONE" ? new Date() : null,
      },
    })
  );

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath("/tasks");
  return {};
}

// Same as createTask, but for the standalone /tasks/new page (as opposed to
// the project-embedded quick-add, which stays put and resets its own
// input) — redirects to the new task's own detail page afterward.
export async function createTaskAndRedirect(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readTaskForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  const task = await withScopedPrismaClient((db) =>
    db.task.create({
      data: {
        title: data.title,
        projectId: data.projectId,
        phaseId: data.phaseId || null,
        description: data.description,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        completedAt: data.status === "DONE" ? new Date() : null,
      },
    })
  );

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}

export async function updateTask(
  taskId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readTaskForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  // One shared client — needs the task's previous project/status (to
  // revalidate the old project's page and to only stamp completedAt on the
  // TODO->DONE transition, not on every save while already DONE) alongside
  // the update itself.
  const previousProjectId = await withScopedPrismaClient(async (db) => {
    const existing = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true, status: true } });

    await db.task.update({
      where: { id: taskId },
      data: {
        title: data.title,
        projectId: data.projectId,
        phaseId: data.phaseId || null,
        description: data.description,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        completedAt: data.status === "DONE" ? (existing?.status === "DONE" ? undefined : new Date()) : null,
      },
    });

    return existing?.projectId;
  });

  revalidatePath(`/projects/${data.projectId}`);
  if (previousProjectId && previousProjectId !== data.projectId) {
    revalidatePath(`/projects/${previousProjectId}`);
  }
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  return { success: t.actions.taskUpdated };
}

export async function toggleTaskStatus(taskId: string, projectId: string, done: boolean) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await withScopedPrismaClient((db) =>
    db.task.update({
      where: { id: taskId },
      data: {
        status: done ? "DONE" : "TODO",
        completedAt: done ? new Date() : null,
      },
    })
  );

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteTask(taskId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await withScopedPrismaClient((db) => db.task.delete({ where: { id: taskId } }));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
}
