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

// Parallel "phaseId" (empty for a new row)/"phaseName" inputs, same index =
// same row — mirrors readSocialLinks in actions/contacts.ts.
function readPhases(formData: FormData): { id: string; name: string }[] {
  const ids = formData.getAll("phaseId").map(String);
  const names = formData.getAll("phaseName").map(String);
  const phases: { id: string; name: string }[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i].trim();
    if (!name) continue;
    phases.push({ id: ids[i] ?? "", name });
  }
  return phases;
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

  const phases = readPhases(formData);

  // One shared client — the update, team-member resync, and phase
  // add/rename/delete would otherwise each open their own connection.
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

    // Phases: update rows that carried an existing id, create the rest,
    // and drop any existing phase the submission no longer lists (its
    // tasks fall back to no phase via the FK's ON DELETE SET NULL).
    const existingPhases = await db.projectPhase.findMany({ where: { projectId } });
    const submittedIds = new Set(phases.filter((p) => p.id).map((p) => p.id));
    for (const existing of existingPhases) {
      if (!submittedIds.has(existing.id)) {
        await db.projectPhase.delete({ where: { id: existing.id } });
      }
    }
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      if (phase.id) {
        await db.projectPhase.update({ where: { id: phase.id }, data: { name: phase.name, order: i } });
      } else {
        await db.projectPhase.create({ data: { projectId, name: phase.name, order: i } });
      }
    }
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
