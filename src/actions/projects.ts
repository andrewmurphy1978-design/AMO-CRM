"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";

const ProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  contactId: z.string().min(1, "Client is required"),
  description: z.string().trim().optional(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
  type: z.enum(["WEBSITE", "FUNNEL", "APP", "SOCIAL_MEDIA", "CONSULTING", "OTHER"]),
  ownerId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  teamMemberIds: z.array(z.string()),
});

function readProjectForm(formData: FormData) {
  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    contactId: String(formData.get("contactId") ?? ""),
    description: String(formData.get("description") ?? "").trim() || undefined,
    status: String(formData.get("status") ?? "PLANNING"),
    type: String(formData.get("type") ?? "OTHER"),
    ownerId: String(formData.get("ownerId") ?? "") || undefined,
    startDate: String(formData.get("startDate") ?? "") || undefined,
    dueDate: String(formData.get("dueDate") ?? "") || undefined,
    teamMemberIds: [...new Set(formData.getAll("teamMemberIds").map(String).filter(Boolean))],
  };
  return ProjectSchema.parse(raw);
}

export interface PhaseValues {
  name: string;
  status: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  phaseType: string;
  teamMemberIds: string[];
  startDate: string;
  dueDate: string;
  description: string;
}

const PhaseSchema = z.object({
  name: z.string().trim().min(1, "Phase name is required"),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
  phaseType: z.string().trim().optional(),
  teamMemberIds: z.array(z.string()),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  description: z.string().trim().optional(),
});

function phaseData(values: PhaseValues) {
  const data = PhaseSchema.parse(values);
  return {
    name: data.name,
    status: data.status,
    phaseType: data.phaseType || null,
    teamMemberIds: data.teamMemberIds,
    startDate: data.startDate ? new Date(data.startDate) : null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    description: data.description || null,
  };
}

// Phases are edited through their own dialog (see phase-dialog.tsx) and
// saved immediately via these actions, independent of the main project
// form's submit — same reasoning as Tasks' quick-add/inline-edit rather
// than a bulk resync on project save.
export async function createPhase(
  projectId: string,
  order: number,
  values: PhaseValues
): Promise<{ id?: string; error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  let data;
  try {
    data = phaseData(values);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Invalid input" };
    throw error;
  }

  const phase = await withScopedPrismaClient((db) => db.projectPhase.create({ data: { projectId, order, ...data } }));
  revalidatePath(`/projects/${projectId}/edit`);
  revalidatePath(`/projects/${projectId}`);
  return { id: phase.id };
}

export async function updatePhase(
  phaseId: string,
  projectId: string,
  values: PhaseValues
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  let data;
  try {
    data = phaseData(values);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Invalid input" };
    throw error;
  }

  await withScopedPrismaClient((db) => db.projectPhase.update({ where: { id: phaseId }, data }));
  revalidatePath(`/projects/${projectId}/edit`);
  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function deletePhase(phaseId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await withScopedPrismaClient((db) => db.projectPhase.delete({ where: { id: phaseId } }));
  revalidatePath(`/projects/${projectId}/edit`);
  revalidatePath(`/projects/${projectId}`);
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
        type: data.type,
        ownerId: data.ownerId || session.user.id,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });

    if (data.teamMemberIds.length > 0) {
      await db.projectTeamMember.createMany({
        data: data.teamMemberIds.map((userId) => ({ projectId: project.id, userId })),
      });
    }

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

  // One shared client — the update and team-member resync would
  // otherwise each open their own connection.
  await withScopedPrismaClient(async (db) => {
    await db.project.update({
      where: { id: projectId },
      data: {
        name: data.name,
        contactId: data.contactId,
        description: data.description,
        status: data.status,
        type: data.type,
        ownerId: data.ownerId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });

    // Full replace — simplest correct sync, same reasoning as
    // updateContact's social-links resync.
    await db.projectTeamMember.deleteMany({ where: { projectId } });
    if (data.teamMemberIds.length > 0) {
      await db.projectTeamMember.createMany({
        data: data.teamMemberIds.map((userId) => ({ projectId, userId })),
      });
    }
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { success: t.actions.projectUpdated };
}

export async function deleteProject(projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await withScopedPrismaClient((db) => db.project.delete({ where: { id: projectId } }));
  revalidatePath("/projects");
  redirect("/projects");
}
