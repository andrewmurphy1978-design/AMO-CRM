import type { PrismaClient } from "@/lib/prisma";
import type { PhaseStage } from "@/lib/project-templates";

// The project lifecycle, driven by approvals, payments and finished phases:
//
//   PROPOSAL  Proposal phase: prepare / send / await the answer. When the
//             proposal is ACCEPTED and the 1st instalment is paid -> PLANNING
//             (and the Contact becomes a Client).
//   PLANNING  Research, then Mock-up (each only once the previous one is done).
//             When they're finished (the mock-up accepted) -> ACTIVE, which is
//             when the 2nd instalment is due. With no such phases it goes
//             straight to ACTIVE.
//   ACTIVE    Building, Testing, Presenting, Deploying — one phase at a time,
//             each created only when the previous is completed. After the last
//             one (deployed) -> FINAL.
//   FINAL     Awaiting the last instalment. Paid -> COMPLETED.
//
// Phases wait in Project.pendingPhases (each with its stage) and are created
// one by one. ON_HOLD / CANCELLED / COMPLETED projects are left alone.

export interface PendingPhase {
  name: string;
  tasks: string[];
  stage?: PhaseStage;
}

const LIFECYCLE = ["PROPOSAL", "PLANNING", "ACTIVE", "FINAL"];
const SECOND_INSTALMENT_TASK = "Collect the 2nd instalment";
const FALLBACK_INSTALMENT_COUNT = 3;

function asPending(value: unknown): PendingPhase[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is PendingPhase => Boolean(p) && typeof (p as PendingPhase).name === "string" && Array.isArray((p as PendingPhase).tasks))
    .map((p) => ({ name: p.name, tasks: p.tasks.map(String), stage: p.stage }));
}

// Moves a Contact up the pipeline, never down: Prospect only from Lead;
// Client from Lead or Prospect.
export async function promoteContact(db: PrismaClient, contactId: string | null | undefined, to: "PROSPECT" | "CLIENT"): Promise<void> {
  if (!contactId) return;
  const from = to === "PROSPECT" ? ["LEAD"] : ["LEAD", "PROSPECT"];
  await db.contact.updateMany({ where: { id: contactId, stage: { in: from as never[] } }, data: { stage: to } });
}

// Instalments paid so far: the larger of "schedule rows ticked paid" and "paid
// invoices" — whichever the user marks first counts.
async function instalmentState(db: PrismaClient, projectId: string) {
  const rows = await db.proposalPaymentScheduleItem.findMany({ where: { proposal: { projectId, status: "ACCEPTED" } }, select: { paid: true } });
  const paidInvoices = await db.invoice.count({ where: { projectId, status: "PAID" } });
  const paidRows = rows.filter((r) => r.paid).length;
  const accepted = (await db.proposal.count({ where: { projectId, status: "ACCEPTED" } })) > 0;
  return { accepted, paid: Math.max(paidRows, paidInvoices), total: rows.length || FALLBACK_INSTALMENT_COUNT };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadProject>>>;

async function loadProject(db: PrismaClient, projectId: string) {
  return db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      contactId: true,
      status: true,
      lifecycleManaged: true,
      pendingPhases: true,
      phases: { orderBy: { order: "desc" }, take: 1, select: { id: true, order: true, status: true, tasks: { select: { status: true } } } },
    },
  });
}

// Completes the latest phase (its open tasks are ticked) — used when a payment
// or approval, not the tasks themselves, is what finished it.
async function closeLatestPhase(db: PrismaClient, pr: Loaded) {
  const last = pr.phases[0];
  if (!last) return;
  await db.task.updateMany({ where: { phaseId: last.id, NOT: { status: "DONE" } }, data: { status: "DONE", completedAt: new Date() } });
  await db.projectPhase.update({ where: { id: last.id }, data: { status: "COMPLETED" } });
}

// Creates the next waiting phase (closing the previous one if it isn't).
async function release(db: PrismaClient, pr: Loaded, pending: PendingPhase[], extraFirstTask?: string) {
  const [next, ...rest] = pending;
  const last = pr.phases[0];
  if (last && last.status !== "COMPLETED") await db.projectPhase.update({ where: { id: last.id }, data: { status: "COMPLETED" } });
  const created = await db.projectPhase.create({ data: { projectId: pr.id, name: next.name, order: (last?.order ?? -1) + 1, status: "ACTIVE" } });
  const titles = [...(extraFirstTask ? [extraFirstTask] : []), ...next.tasks];
  if (titles.length > 0) await db.task.createMany({ data: titles.map((title) => ({ projectId: pr.id, phaseId: created.id, title })) });
  await db.project.update({ where: { id: pr.id }, data: { pendingPhases: rest.length > 0 ? (rest as never) : (null as never) } });
}

async function setStatus(db: PrismaClient, projectId: string, status: "PLANNING" | "ACTIVE" | "FINAL" | "COMPLETED") {
  await db.project.update({ where: { id: projectId }, data: { status } });
}

// One step of the lifecycle; true if something changed (so the caller loops).
async function step(db: PrismaClient, pr: Loaded): Promise<boolean> {
  const pending = asPending(pr.pendingPhases);
  const last = pr.phases[0];
  const lastFinished = !last || last.status === "COMPLETED" || (last.tasks.length > 0 && last.tasks.every((t) => t.status === "DONE"));
  const stageOf = (p?: PendingPhase) => p?.stage ?? "ACTIVE";
  const money = await instalmentState(db, pr.id);
  const secondInstalmentTask = money.paid >= 2 ? undefined : SECOND_INSTALMENT_TASK;

  switch (pr.status) {
    case "PROPOSAL": {
      if (!(money.accepted && money.paid >= 1)) return false;
      await closeLatestPhase(db, pr);
      await promoteContact(db, pr.contactId, "CLIENT");
      if (stageOf(pending[0]) === "PLANNING" && pending.length > 0) {
        await setStatus(db, pr.id, "PLANNING");
        await release(db, pr, pending);
      } else {
        // Nothing to research or mock up: straight to Active.
        await setStatus(db, pr.id, "ACTIVE");
        if (pending.length > 0) await release(db, pr, pending, stageOf(pending[0]) === "ACTIVE" ? secondInstalmentTask : undefined);
      }
      return true;
    }
    case "PLANNING": {
      if (!lastFinished) return false;
      if (pending.length > 0 && stageOf(pending[0]) === "PLANNING") {
        await release(db, pr, pending);
      } else {
        // Mock-up (or research) accepted/finished: the project goes Active and the
        // 2nd instalment falls due.
        await setStatus(db, pr.id, "ACTIVE");
        if (pending.length > 0) await release(db, pr, pending, stageOf(pending[0]) === "ACTIVE" ? secondInstalmentTask : undefined);
      }
      return true;
    }
    case "ACTIVE": {
      if (!lastFinished) return false;
      if (pending.length > 0 && stageOf(pending[0]) === "ACTIVE") {
        await release(db, pr, pending);
      } else {
        // Deployed: waiting on the final instalment.
        await setStatus(db, pr.id, "FINAL");
        if (pending.length > 0) await release(db, pr, pending);
      }
      return true;
    }
    case "FINAL": {
      if (!(money.paid >= money.total)) return false;
      await closeLatestPhase(db, pr);
      await setStatus(db, pr.id, "COMPLETED");
      return true;
    }
  }
  return false;
}

// Re-evaluates a project's lifecycle after anything that could move it: a task
// or phase finished, a proposal accepted, an instalment or invoice paid.
export async function syncProjectLifecycle(db: PrismaClient, projectId: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const pr = await loadProject(db, projectId);
    if (!pr || !pr.lifecycleManaged || !LIFECYCLE.includes(pr.status)) return;
    if (!(await step(db, pr))) return;
  }
}

// Names kept so existing call sites read the same.
export const advanceProjectPlan = syncProjectLifecycle;
export const onProposalAccepted = syncProjectLifecycle;
