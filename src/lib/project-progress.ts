import type { PrismaClient } from "@/lib/prisma";

// Phases are released one at a time. A new project gets its first phase
// (Planning) and that phase's tasks; the rest wait in Project.pendingPhases.
// When the latest phase is finished — every task done, or the phase marked
// Completed — it is closed and the next waiting phase is created with its
// tasks.

export interface PendingPhase {
  name: string;
  tasks: string[];
}

function asPending(value: unknown): PendingPhase[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is PendingPhase => Boolean(p) && typeof (p as PendingPhase).name === "string" && Array.isArray((p as PendingPhase).tasks))
    .map((p) => ({ name: p.name, tasks: p.tasks.map(String) }));
}

// Returns true when a new phase was added.
export async function advanceProjectPlan(db: PrismaClient, projectId: string): Promise<boolean> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      pendingPhases: true,
      phases: { orderBy: { order: "desc" }, take: 1, select: { id: true, order: true, status: true, tasks: { select: { status: true } } } },
    },
  });
  if (!project) return false;
  const pending = asPending(project.pendingPhases);
  if (pending.length === 0) return false;

  const last = project.phases[0];
  if (last) {
    const finished = last.status === "COMPLETED" || (last.tasks.length > 0 && last.tasks.every((t) => t.status === "DONE"));
    if (!finished) return false;
    if (last.status !== "COMPLETED") await db.projectPhase.update({ where: { id: last.id }, data: { status: "COMPLETED" } });
  }

  const [next, ...rest] = pending;
  const created = await db.projectPhase.create({
    data: { projectId, name: next.name, order: (last?.order ?? -1) + 1, status: "ACTIVE" },
  });
  if (next.tasks.length > 0) {
    await db.task.createMany({ data: next.tasks.map((title) => ({ projectId, phaseId: created.id, title })) });
  }
  await db.project.update({ where: { id: projectId }, data: { pendingPhases: rest.length > 0 ? (rest as never) : (null as never) } });
  return true;
}

// The proposal was accepted: the Planning phase is done — its remaining tasks
// are ticked off — and the next phase is released.
export async function onProposalAccepted(db: PrismaClient, projectId: string): Promise<void> {
  const first = await db.projectPhase.findFirst({ where: { projectId }, orderBy: { order: "asc" }, select: { id: true, name: true, status: true } });
  if (!first || !/planning|planification/i.test(first.name)) return;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { pendingPhases: true } });
  if (asPending(project?.pendingPhases).length === 0) return;
  // Only while still in planning — an accept on a later date must not skip ahead.
  const phaseCount = await db.projectPhase.count({ where: { projectId } });
  if (phaseCount !== 1) return;
  await db.task.updateMany({ where: { phaseId: first.id, NOT: { status: "DONE" } }, data: { status: "DONE", completedAt: new Date() } });
  await db.projectPhase.update({ where: { id: first.id }, data: { status: "COMPLETED" } });
  await advanceProjectPlan(db, projectId);
}
