import type { PrismaClient } from "@/lib/prisma";

const DAY = 86_400_000;

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}

// Rows for the tasks of a new phase. They are created in order (createdAt differs by a millisecond
// each, so lists keep the template's order); the first one can start right away, and every task
// remembers its deadline delay (days from its start to its due date).
export function taskRows(projectId: string, phaseId: string, titles: string[], delays?: (number | null | undefined)[], start?: Date | null) {
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
export async function onTaskDone(db: PrismaClient, taskId: string): Promise<void> {
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
