import type { PrismaClient } from "@/lib/prisma";
import { phaseStatusFor } from "@/lib/project-status";

const DAY = 86_400_000;

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}

// Rows for the tasks of a new phase. They are created in order (createdAt differs by a millisecond
// each, so lists keep the template's order); the first one can start right away, and every task
// remembers its deadline delay (days from its start to its due date).
// Who a new task is for: its supervisor is the project's supervisor (else the project's owner) and it is assigned
// to every team member of the project.
export interface TaskWho {
  supervisorId: string | null;
  assigneeIds: string[];
}

export async function taskWho(db: PrismaClient, projectId: string): Promise<TaskWho> {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { supervisorId: true, ownerId: true, teamMembers: { select: { userId: true } } } });
  return { supervisorId: p?.supervisorId ?? p?.ownerId ?? null, assigneeIds: p?.teamMembers.map((m) => m.userId) ?? [] };
}

// The project's supervisor (else owner) changed: its tasks that are not completed follow.
export async function syncTaskSupervisor(db: PrismaClient, projectId: string, before: { supervisorId: string | null; ownerId: string | null } | null): Promise<void> {
  const now = await db.project.findUnique({ where: { id: projectId }, select: { supervisorId: true, ownerId: true } });
  const was = before ? (before.supervisorId ?? before.ownerId) : null;
  const is = now ? (now.supervisorId ?? now.ownerId) : null;
  if (!is || is === was) return;
  await db.task.updateMany({ where: { projectId, status: { not: "DONE" } }, data: { supervisorId: is } });
}

export function taskRows(projectId: string, phaseId: string, titles: string[], delays?: (number | null | undefined)[], start?: Date | null, who?: TaskWho) {
  const base = Date.now();
  return titles.map((title, i) => {
    const delay = delays?.[i] ?? null;
    const starts = i === 0 && start;
    return {
      projectId,
      phaseId,
      title,
      createdAt: new Date(base + i),
      delayDays: delay,
      ...(who ? { supervisorId: who.supervisorId, assigneeIds: who.assigneeIds, assigneeId: who.assigneeIds[0] ?? null } : {}),
      ...(starts ? { startDate: start, ...(delay != null ? { dueDate: addDays(start, delay) } : {}) } : {}),
    };
  });
}

// A phase starting on `start`: its start date, and its due date from the template's delay.
export function phaseDates(start: Date, delayDays?: number | null) {
  return { startDate: start, ...(delayDays != null ? { dueDate: addDays(start, delayDays) } : {}) };
}

// When a task is finished, the next task of its phase (the first one not done and not yet started)
// starts that same moment, with its due date from its own delay.
async function startNextTask(db: PrismaClient, taskId: string): Promise<void> {
  const done = await db.task.findUnique({ where: { id: taskId }, select: { phaseId: true, completedAt: true } });
  if (!done?.phaseId) return;
  const at = done.completedAt ?? new Date();
  const siblings = await db.task.findMany({ where: { phaseId: done.phaseId }, orderBy: { createdAt: "asc" }, select: { id: true, status: true, startDate: true, dueDate: true, delayDays: true } });
  const next = siblings.find((t) => t.status !== "DONE" && !t.startDate);
  if (!next) {
    // The phase is finished: the next phase's first task starts now.
    if (siblings.some((t) => t.status !== "DONE")) return;
    const phase = await db.projectPhase.findUnique({ where: { id: done.phaseId }, select: { projectId: true, order: true } });
    if (!phase) return;
    const following = await db.projectPhase.findFirst({ where: { projectId: phase.projectId, order: { gt: phase.order } }, orderBy: { order: "asc" }, select: { id: true } });
    if (!following) return;
    const first = await db.task.findFirst({ where: { phaseId: following.id, startDate: null, status: { not: "DONE" } }, orderBy: { createdAt: "asc" }, select: { id: true, dueDate: true, delayDays: true } });
    if (first) await db.task.update({ where: { id: first.id }, data: { startDate: at, ...(first.delayDays != null && !first.dueDate ? { dueDate: addDays(at, first.delayDays) } : {}) } });
    return;
  }
  await db.task.update({ where: { id: next.id }, data: { startDate: at, ...(next.delayDays != null && !next.dueDate ? { dueDate: addDays(at, next.delayDays) } : {}) } });
}

// When a task is finished: the next task starts (see above) and the phase is checked.
export async function onTaskDone(db: PrismaClient, taskId: string): Promise<void> {
  await startNextTask(db, taskId);
  await syncPhaseOfTask(db, taskId);
}

// A phase follows its tasks: when the last task is done it becomes Completed (with its completion date) and the
// next phase that isn't completed becomes Active (starting now); if a task of a completed phase is reopened,
// the phase is Active again.
export async function syncPhaseStatus(db: PrismaClient, phaseId: string): Promise<void> {
  const phase = await db.projectPhase.findUnique({ where: { id: phaseId }, select: { id: true, name: true, projectId: true, order: true, status: true, tasks: { select: { status: true, completedAt: true } } } });
  if (!phase || phase.tasks.length === 0) return;
  const allDone = phase.tasks.every((t) => t.status === "DONE");
  if (allDone && phase.status !== "COMPLETED") {
    const last = phase.tasks.reduce<Date | null>((m, t) => (t.completedAt && (!m || t.completedAt > m) ? t.completedAt : m), null);
    const at = last ?? new Date();
    await db.projectPhase.update({ where: { id: phase.id }, data: { status: "COMPLETED", completedAt: at } });
    const project = await db.project.findUnique({ where: { id: phase.projectId }, select: { status: true } });
    const next = await db.projectPhase.findFirst({ where: { projectId: phase.projectId, order: { gt: phase.order }, NOT: { status: "COMPLETED" } }, orderBy: { order: "asc" }, select: { id: true, name: true, startDate: true } });
    if (next) await db.projectPhase.update({ where: { id: next.id }, data: { status: phaseStatusFor(project?.status ?? "BUILDING", next.name), ...(next.startDate ? {} : { startDate: at }) } });
  } else if (!allDone && phase.status === "COMPLETED") {
    const owner = await db.project.findUnique({ where: { id: phase.projectId }, select: { status: true } });
    await db.projectPhase.update({ where: { id: phase.id }, data: { status: phaseStatusFor(owner?.status ?? "BUILDING", phase.name), completedAt: null } });
  }
}

export async function syncPhaseOfTask(db: PrismaClient, taskId: string): Promise<void> {
  const t = await db.task.findUnique({ where: { id: taskId }, select: { phaseId: true } });
  if (t?.phaseId) await syncPhaseStatus(db, t.phaseId);
}
