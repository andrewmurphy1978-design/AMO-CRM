"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";

const TaskSchema = z.object({
  title: z.string().trim().min(1, "Task title is required"),
  projectId: z.string().min(1),
  description: z.string().trim().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
});

function readTaskForm(formData: FormData) {
  const raw = {
    title: String(formData.get("title") ?? "").trim(),
    projectId: String(formData.get("projectId") ?? ""),
    description: String(formData.get("description") ?? "").trim() || undefined,
    status: String(formData.get("status") ?? "TODO"),
    priority: String(formData.get("priority") ?? "MEDIUM"),
    assigneeId: String(formData.get("assigneeId") ?? "") || undefined,
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

  await prisma.task.create({
    data: {
      title: data.title,
      projectId: data.projectId,
      description: data.description,
      status: data.status,
      priority: data.priority,
      assigneeId: data.assigneeId || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  });

  revalidatePath(`/projects/${data.projectId}`);
  return {};
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

  await prisma.task.update({
    where: { id: taskId },
    data: {
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      assigneeId: data.assigneeId || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      completedAt: data.status === "DONE" ? new Date() : null,
    },
  });

  revalidatePath(`/projects/${data.projectId}`);
  return { success: t.actions.taskUpdated };
}

export async function toggleTaskStatus(taskId: string, projectId: string, done: boolean) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: done ? "DONE" : "TODO",
      completedAt: done ? new Date() : null,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteTask(taskId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath(`/projects/${projectId}`);
}
