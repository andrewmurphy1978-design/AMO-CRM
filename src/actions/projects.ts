"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma, withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";

const ProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  contactId: z.string().min(1, "Client is required"),
  description: z.string().trim().optional(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
  ownerId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
});

function readProjectForm(formData: FormData) {
  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    contactId: String(formData.get("contactId") ?? ""),
    description: String(formData.get("description") ?? "").trim() || undefined,
    status: String(formData.get("status") ?? "PLANNING"),
    ownerId: String(formData.get("ownerId") ?? "") || undefined,
    startDate: String(formData.get("startDate") ?? "") || undefined,
    dueDate: String(formData.get("dueDate") ?? "") || undefined,
  };
  return ProjectSchema.parse(raw);
}

export async function createProject(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readProjectForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  const project = await withScopedPrismaClient(async (db) => {
    const project = await db.project.create({
      data: {
        name: data.name,
        contactId: data.contactId,
        description: data.description,
        status: data.status,
        ownerId: data.ownerId || session.user.id,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });

    await db.activityLogEntry.create({
      data: {
        projectId: project.id,
        contactId: data.contactId,
        userId: session.user.id,
        message: t.actions.createdProject(session.user.name ?? "", project.name),
      },
    });

    return project;
  });

  revalidatePath("/projects");
  revalidatePath(`/contacts/${data.contactId}`);
  redirect(`/projects/${project.id}`);
}

export async function updateProject(
  projectId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readProjectForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name: data.name,
      contactId: data.contactId,
      description: data.description,
      status: data.status,
      ownerId: data.ownerId || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { success: t.actions.projectUpdated };
}

export async function deleteProject(projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await prisma.project.delete({ where: { id: projectId } });
  revalidatePath("/projects");
  redirect("/projects");
}
