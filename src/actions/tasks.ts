"use server";

import { onTaskDone } from "@/lib/task-schedule";
import { advanceProjectPlan } from "@/lib/project-progress";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { syncGoogleTasksForTask, removeTaskFromGoogle } from "@/lib/google-tasks";
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
  supervisorId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  completedDate: z.string().optional(),
  aiPrompt: z.string().trim().optional(),
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
    supervisorId: String(formData.get("supervisorId") ?? "") || undefined,
    startDate: String(formData.get("startDate") ?? "") || undefined,
    dueDate: String(formData.get("dueDate") ?? "") || undefined,
    completedDate: String(formData.get("completedDate") ?? "") || undefined,
    aiPrompt: String(formData.get("aiPrompt") ?? "").trim() || undefined,
  };
  return TaskSchema.parse(raw);
}

export interface TaskDialogValues {
  title: string;
  phaseId: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assigneeId: string;
  supervisorId: string;
  startDate: string;
  dueDate: string;
  completedDate?: string;
  description: string;
  aiPrompt?: string;
}

// Used by TaskDialog (project-info page's "Add task" button) — same shape
// as createPhase: saved immediately via a plain value object rather than a
// <form action> + FormData, since the dialog isn't a form submission.
export async function createTaskViaDialog(
  projectId: string,
  values: TaskDialogValues
): Promise<{ id?: string; error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  let data;
  try {
    data = TaskSchema.parse({ ...values, projectId });
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Invalid input" };
    throw error;
  }

  const task = await withScopedPrismaClient((db) =>
    db.task.create({
      data: {
        title: data.title,
        projectId,
        phaseId: data.phaseId || null,
        description: data.description,
        aiPrompt: data.aiPrompt ?? null,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        supervisorId: data.supervisorId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        completedAt: data.completedDate && data.status === "DONE" ? new Date(data.completedDate) : data.status === "DONE" ? new Date() : null,
      },
    })
  );

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  await syncGoogleTasksForTask(task.id);
  return { id: task.id };
}

// Edits an existing task from the project page's Tasks card — same value
// object and validation as createTaskViaDialog, applied to one task.
export async function updateTaskViaDialog(
  taskId: string,
  projectId: string,
  values: TaskDialogValues
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  let data;
  try {
    data = TaskSchema.parse({ ...values, projectId });
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Invalid input" };
    throw error;
  }

  await withScopedPrismaClient(async (db) => {
    const existing = await db.task.findUnique({ where: { id: taskId }, select: { status: true } });
    await db.task.update({
      where: { id: taskId },
      data: {
        title: data.title,
        phaseId: data.phaseId || null,
        description: data.description,
        aiPrompt: data.aiPrompt ?? null,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        supervisorId: data.supervisorId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        completedAt: data.completedDate && data.status === "DONE" ? new Date(data.completedDate) : data.status === "DONE" ? (existing?.status === "DONE" ? undefined : new Date()) : null,
      },
    });
    if (data.status === "DONE") {
      if (existing?.status !== "DONE") await onTaskDone(db, taskId);
      await advanceProjectPlan(db, projectId);
    }
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  await syncGoogleTasksForTask(taskId);
  return {};
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

  const created = await withScopedPrismaClient((db) =>
    db.task.create({
      data: {
        title: data.title,
        projectId: data.projectId,
        phaseId: data.phaseId || null,
        description: data.description,
        aiPrompt: data.aiPrompt ?? null,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        supervisorId: data.supervisorId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        completedAt: data.completedDate && data.status === "DONE" ? new Date(data.completedDate) : data.status === "DONE" ? new Date() : null,
      },
    })
  );

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath("/tasks");
  await syncGoogleTasksForTask(created.id);
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
        aiPrompt: data.aiPrompt ?? null,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        supervisorId: data.supervisorId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        completedAt: data.completedDate && data.status === "DONE" ? new Date(data.completedDate) : data.status === "DONE" ? new Date() : null,
      },
    })
  );

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath("/tasks");
  await syncGoogleTasksForTask(task.id);
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
        aiPrompt: data.aiPrompt ?? null,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        supervisorId: data.supervisorId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        completedAt: data.completedDate && data.status === "DONE" ? new Date(data.completedDate) : data.status === "DONE" ? (existing?.status === "DONE" ? undefined : new Date()) : null,
      },
    });
    if (data.status === "DONE") {
      if (existing?.status !== "DONE") await onTaskDone(db, taskId);
      await advanceProjectPlan(db, data.projectId);
    }

    return existing?.projectId;
  });

  revalidatePath(`/projects/${data.projectId}`);
  if (previousProjectId && previousProjectId !== data.projectId) {
    revalidatePath(`/projects/${previousProjectId}`);
  }
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  await syncGoogleTasksForTask(taskId);
  return { success: t.actions.taskUpdated };
}

export async function toggleTaskStatus(taskId: string, projectId: string, done: boolean) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await withScopedPrismaClient(async (db) => {
    await db.task.update({
      where: { id: taskId },
      data: {
        status: done ? "DONE" : "TODO",
        completedAt: done ? new Date() : null,
      },
    });
    // Finishing the last task of the latest phase releases the next phase.
    if (done) {
      await onTaskDone(db, taskId);
      await advanceProjectPlan(db, projectId);
    }
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  await syncGoogleTasksForTask(taskId);
}

export async function deleteTask(taskId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await removeTaskFromGoogle(taskId);
  await withScopedPrismaClient((db) => db.task.delete({ where: { id: taskId } }));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
}
