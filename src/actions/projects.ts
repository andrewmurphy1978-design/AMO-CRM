"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import type { PrismaClient } from "@/lib/prisma";
import { advanceProjectPlan } from "@/lib/project-progress";
import { getProjectTemplate } from "@/lib/project-template-store";
import { buildMultiPlan, cleanValues, readFieldValues, typesOfProject, type FieldValues, type TypeInput } from "@/lib/project-templates";
import { getTypeLabels } from "@/lib/project-type-store";
import { appSubscriptionsFrom } from "@/lib/project-subscriptions";

const ProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  contactId: z.string().min(1, "Client is required"),
  description: z.string().trim().optional(),
  status: z.enum(["PROPOSAL", "PLANNING", "ACTIVE", "FINAL", "ON_HOLD", "COMPLETED", "CANCELLED"]),
  types: z.array(z.string().min(1)).min(1, "Choose at least one project type"),
  ownerId: z.string().optional(),
  supervisorId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  teamMemberIds: z.array(z.string()),
});

// The chosen types, in order (the form posts one `types` entry per selected type).
function readTypes(formData: FormData): string[] {
  const list = [...new Set(formData.getAll("types").map(String).filter(Boolean))];
  if (list.length > 0) return list;
  const single = String(formData.get("type") ?? "").trim();
  return single ? [single] : [];
}

function readProjectForm(formData: FormData) {
  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    contactId: String(formData.get("contactId") ?? ""),
    description: String(formData.get("description") ?? "").trim() || undefined,
    status: String(formData.get("status") ?? "PROPOSAL"),
    types: readTypes(formData),
    ownerId: String(formData.get("ownerId") ?? "") || undefined,
    supervisorId: String(formData.get("supervisorId") ?? "") || undefined,
    startDate: String(formData.get("startDate") ?? "") || undefined,
    dueDate: String(formData.get("dueDate") ?? "") || undefined,
    teamMemberIds: [...new Set(formData.getAll("teamMemberIds").map(String).filter(Boolean))],
  };
  return ProjectSchema.parse(raw);
}

export interface PhaseValues {
  name: string;
  status: "PROPOSAL" | "PLANNING" | "ACTIVE" | "FINAL" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  phaseType: string;
  teamMemberIds: string[];
  supervisorId: string;
  startDate: string;
  dueDate: string;
  completedDate?: string;
  description: string;
}

const PhaseSchema = z.object({
  name: z.string().trim().min(1, "Phase name is required"),
  status: z.enum(["PROPOSAL", "PLANNING", "ACTIVE", "FINAL", "ON_HOLD", "COMPLETED", "CANCELLED"]),
  phaseType: z.string().trim().optional(),
  teamMemberIds: z.array(z.string()),
  supervisorId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  completedDate: z.string().optional(),
  description: z.string().trim().optional(),
});

function phaseData(values: PhaseValues) {
  const data = PhaseSchema.parse(values);
  return {
    name: data.name,
    status: data.status,
    phaseType: data.phaseType || null,
    teamMemberIds: data.teamMemberIds,
    supervisorId: data.supervisorId || null,
    startDate: data.startDate ? new Date(data.startDate) : null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    description: data.description || null,
    // The date typed in, if any; otherwise (set when saving) today for a completed phase.
    completedAt: data.completedDate && data.status === "COMPLETED" ? new Date(data.completedDate) : null,
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

  const phase = await withScopedPrismaClient((db) => db.projectPhase.create({ data: { projectId, order, ...data, completedAt: data.completedAt ?? (data.status === "COMPLETED" ? new Date() : null) } }));
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

  await withScopedPrismaClient(async (db) => {
    const existing = await db.projectPhase.findUnique({ where: { id: phaseId }, select: { completedAt: true } });
    const completedAt = data.completedAt ?? (data.status === "COMPLETED" ? existing?.completedAt ?? new Date() : null);
    await db.projectPhase.update({ where: { id: phaseId }, data: { ...data, completedAt } });
    // Marking the latest phase Completed releases the next one.
    if (data.status === "COMPLETED") await advanceProjectPlan(db, projectId);
  });
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

interface NewProjectInput {
  name: string;
  description?: string;
  contactId: string;
  status: "PROPOSAL" | "PLANNING" | "ACTIVE" | "FINAL" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  ownerId: string;
  supervisorId: string | null;
  teamMemberIds: string[];
  startDate?: Date;
  dueDate?: Date;
  userId: string;
  userName: string;
  // One entry per selected type, in order, with that type's template and answers.
  types: TypeInput[];
}

// Creates the project row, its team, an activity entry, and the phases and
// tasks the selected types' templates call for given each type's answers.
async function createProjectFromTemplate(db: PrismaClient, input: NewProjectInput) {
  const typeFields: Record<string, FieldValues> = {};
  for (const t of input.types) typeFields[t.type] = cleanValues(t.template, t.values);
  const managed = input.types.every((t) => t.template.progressive !== false);
  const project = await db.project.create({
    data: {
      name: input.name,
      contactId: input.contactId,
      description: input.description,
      status: input.status,
      type: input.types[0].type,
      types: input.types.map((t) => t.type),
      ownerId: input.ownerId,
      supervisorId: input.supervisorId,
      startDate: input.startDate,
      dueDate: input.dueDate,
      typeFields: typeFields as never,
      lifecycleManaged: managed,
    },
  });

  // The apps chosen in the details become the project's Apps & subscriptions.
  const seen = new Set<string>();
  const subs = input.types
    .flatMap((t) => appSubscriptionsFrom(t.template, typeFields[t.type]))
    .filter((x) => (seen.has(x.name.toLowerCase()) ? false : (seen.add(x.name.toLowerCase()), true)));
  if (subs.length > 0) await db.projectSubscription.createMany({ data: subs.map((x, order) => ({ ...x, projectId: project.id, order })) });

  if (input.teamMemberIds.length > 0) {
    await db.projectTeamMember.createMany({ data: input.teamMemberIds.map((userId) => ({ projectId: project.id, userId })) });
  }

  const plan = buildMultiPlan(input.types.map((t) => ({ ...t, values: typeFields[t.type] })));
  // Progressive (default): only the first phase now — the rest are released as
  // each phase is completed. Phases that ended up with no tasks are dropped.
  const phases = managed ? plan.phases.filter((p) => p.tasks.length > 0) : plan.phases;
  const now = managed ? phases.slice(0, 1) : phases;
  for (const [index, phase] of now.entries()) {
    const created = await db.projectPhase.create({
      data: { projectId: project.id, name: phase.name, order: index, ...(managed ? { status: "ACTIVE" as const } : {}) },
    });
    if (phase.tasks.length > 0) {
      await db.task.createMany({ data: phase.tasks.map((title) => ({ projectId: project.id, phaseId: created.id, title })) });
    }
  }
  if (managed && phases.length > 1) {
    await db.project.update({ where: { id: project.id }, data: { pendingPhases: phases.slice(1).map((p) => ({ name: p.name, tasks: p.tasks, stage: p.stage })) as never } });
  }

  await db.activityLogEntry.create({
    data: {
      projectId: project.id,
      contactId: input.contactId,
      userId: input.userId,
      message: getDict("en").actions.createdProject(input.userName, project.name),
    },
  });
  return project;
}

// A project whose types changed: phases of newly added types are added too (as
// pending phases for a lifecycle-managed project, directly otherwise). Types that
// were removed leave their existing phases alone.
async function applyTypeChanges(db: PrismaClient, projectId: string, newTypes: string[]) {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { phases: { select: { name: true, order: true } } } });
  if (!project) return;
  const oldTypes = typesOfProject(project);
  const added = newTypes.filter((t) => !oldTypes.includes(t));
  if (added.length > 0) {
    const labels = await getTypeLabels(db, getDict("en").projectTypes as Record<string, string>, "en");
    const addedPhases: { name: string; tasks: string[]; stage: "PROPOSAL" | "PLANNING" | "ACTIVE" | "FINAL" }[] = [];
    for (const type of added) {
      const template = await getProjectTemplate(db, type);
      const plan = buildMultiPlan([{ type, label: labels[type] ?? type, template, values: {} }]);
      for (const ph of plan.phases) {
        if (/^(proposal|research|mock-up|presenting|deploying|final payment)$/i.test(ph.name)) continue; // shared: already in the plan
        addedPhases.push({ ...ph, name: `${labels[type] ?? type} — ${ph.name}` });
      }
    }
    if (addedPhases.length > 0) {
      if (project.lifecycleManaged) {
        const pending = (Array.isArray(project.pendingPhases) ? project.pendingPhases : []) as { name: string; tasks: string[]; stage?: string }[];
        const closing = /^(presenting|deploying|final payment)$/i;
        const at = pending.findIndex((p) => closing.test(p.name));
        const merged = at === -1 ? [...pending, ...addedPhases] : [...pending.slice(0, at), ...addedPhases, ...pending.slice(at)];
        await db.project.update({ where: { id: projectId }, data: { pendingPhases: merged as never } });
      } else {
        let order = project.phases.reduce((m, p) => Math.max(m, p.order), -1) + 1;
        for (const ph of addedPhases) {
          const created = await db.projectPhase.create({ data: { projectId, name: ph.name, order: order++ } });
          if (ph.tasks.length > 0) await db.task.createMany({ data: ph.tasks.map((title) => ({ projectId, phaseId: created.id, title })) });
        }
      }
    }
  }
  await db.project.update({ where: { id: projectId }, data: { type: newTypes[0], types: newTypes } });
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
    const labels = await getTypeLabels(db, getDict("en").projectTypes as Record<string, string>, "en");
    const types: TypeInput[] = [];
    for (const type of data.types) {
      const template = await getProjectTemplate(db, type);
      // Each type's answers are posted as cf_<TYPE>__<field>.
      const values = readFieldValues(template, (name) => formData.getAll(name.replace(/^cf_/, `cf_${type}__`)).map(String));
      types.push({ type, label: labels[type] ?? type, template, values });
    }
    return createProjectFromTemplate(db, {
      contactId: data.contactId,
      status: data.status,
      ownerId: data.ownerId || session.user.id,
      supervisorId: data.supervisorId || null,
      teamMemberIds: data.teamMemberIds,
      userId: session.user.id,
      userName: session.user.name ?? "",
      name: data.name,
      description: data.description,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      types,
    });
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
        ownerId: data.ownerId || null,
        supervisorId: data.supervisorId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });
    await applyTypeChanges(db, projectId, data.types);

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

// The General Info dialog on the project page: everything about the project
// itself except its notes (own dialog) and phases (own dialog).
export async function updateProjectGeneral(
  projectId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = ProjectSchema.parse({
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || undefined,
      contactId: String(formData.get("contactId") ?? ""),
      status: String(formData.get("status") ?? "PROPOSAL"),
      types: readTypes(formData),
      ownerId: String(formData.get("ownerId") ?? "") || undefined,
      supervisorId: String(formData.get("supervisorId") ?? "") || undefined,
      startDate: String(formData.get("startDate") ?? "") || undefined,
      dueDate: String(formData.get("dueDate") ?? "") || undefined,
      teamMemberIds: [...new Set(formData.getAll("teamMemberIds").map(String).filter(Boolean))],
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }
  const completedInput = String(formData.get("completedAt") ?? "");

  await withScopedPrismaClient(async (db) => {
    const before = await db.project.findUnique({ where: { id: projectId }, select: { completedAt: true } });
    const completedAt = completedInput && data.status === "COMPLETED" ? new Date(completedInput) : data.status === "COMPLETED" ? before?.completedAt ?? new Date() : null;
    await db.project.update({
      where: { id: projectId },
      data: {
        completedAt,
        name: data.name,
        description: data.description || null,
        contactId: data.contactId,
        status: data.status,
        ownerId: data.ownerId || null,
        supervisorId: data.supervisorId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        subscriptionEmail: String(formData.get("subscriptionEmail") ?? "").trim() || null,
      },
    });
    await applyTypeChanges(db, projectId, data.types);
    await db.projectTeamMember.deleteMany({ where: { projectId } });
    if (data.teamMemberIds.length > 0) {
      await db.projectTeamMember.createMany({ data: data.teamMemberIds.map((userId) => ({ projectId, userId })) });
    }
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { success: t.actions.projectUpdated };
}

// The Notes card's dialog — the project's description text.
export async function updateProjectNotes(
  projectId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const notes = String(formData.get("notes") ?? "").trim();
  await withScopedPrismaClient((db) => db.project.update({ where: { id: projectId }, data: { notes: notes || null } }));

  revalidatePath(`/projects/${projectId}`);
  return { success: t.actions.projectUpdated };
}

// The same Notes card, when a phase is selected: that phase's own notes.
export async function updatePhaseNotes(
  projectId: string,
  phaseId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const notes = String(formData.get("notes") ?? "").trim();
  await withScopedPrismaClient((db) => db.projectPhase.updateMany({ where: { id: phaseId, projectId }, data: { notes: notes || null } }));

  revalidatePath(`/projects/${projectId}`);
  return { success: t.actions.projectUpdated };
}

// The Project Details card's dialog: just the answers to this type's custom
// fields (phases and tasks already created are left alone).
export async function updateProjectCustomFields(
  projectId: string,
  type: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { type: true, types: true, typeFields: true, customFields: true } });
    if (!project || !typesOfProject(project).includes(type)) return;
    const template = await getProjectTemplate(db, type);
    // This type's answers are posted as cf_<TYPE>__<field>.
    const values = readFieldValues(template, (name) => formData.getAll(name.replace(/^cf_/, `cf_${type}__`)).map(String));
    const all = { ...((project.typeFields ?? {}) as Record<string, FieldValues>) };
    // A project that predates multiple types keeps its first type's answers in customFields.
    if (!all[project.type] && project.customFields) all[project.type] = project.customFields as FieldValues;
    all[type] = values;
    await db.project.update({ where: { id: projectId }, data: { typeFields: all as never } });
    // Newly chosen apps join the Apps & subscriptions (existing rows are kept).
    const have = await db.projectSubscription.findMany({ where: { projectId }, select: { name: true } });
    const known = new Set(have.map((x) => x.name.trim().toLowerCase()));
    const fresh = appSubscriptionsFrom(template, values).filter((x) => !known.has(x.name.toLowerCase()));
    if (fresh.length > 0) await db.projectSubscription.createMany({ data: fresh.map((x, i) => ({ ...x, projectId, order: have.length + i })) });
  });

  revalidatePath(`/projects/${projectId}`);
  return { success: t.actions.projectUpdated };
}
