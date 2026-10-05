import type { PrismaClient } from "@/lib/prisma";
import { phaseDates, taskRows } from "@/lib/task-schedule";
import { billPendingSupplierCosts } from "@/lib/supplier-costs";
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
  // Deadline delays (days) from the template: the phase's, and each task's (parallel to `tasks`).
  delayDays?: number | null;
  delays?: (number | null)[];
}

const LIFECYCLE = ["PROPOSAL", "PLANNING", "ACTIVE", "FINAL"];
const SECOND_INSTALMENT_TASK = "Collect the 2nd instalment";
const FALLBACK_INSTALMENT_COUNT = 3;

function asPending(value: unknown): PendingPhase[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is PendingPhase => Boolean(p) && typeof (p as PendingPhase).name === "string" && Array.isArray((p as PendingPhase).tasks))
    .map((p) => ({ name: p.name, tasks: p.tasks.map(String), stage: p.stage, delayDays: p.delayDays ?? null, delays: Array.isArray(p.delays) ? p.delays : undefined }));
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
  await db.projectPhase.update({ where: { id: last.id }, data: { status: "COMPLETED", completedAt: new Date() } });
}

// Creates the next waiting phase (closing the previous one if it isn't).
async function release(db: PrismaClient, pr: Loaded, pending: PendingPhase[], extraFirstTask?: string) {
  const [next, ...rest] = pending;
  const last = pr.phases[0];
  if (last && last.status !== "COMPLETED") await db.projectPhase.update({ where: { id: last.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  const now = new Date();
  const created = await db.projectPhase.create({ data: { projectId: pr.id, name: next.name, order: (last?.order ?? -1) + 1, status: "ACTIVE", ...phaseDates(now, next.delayDays) } });
  const titles = [...(extraFirstTask ? [extraFirstTask] : []), ...next.tasks];
  const delays = [...(extraFirstTask ? [null] : []), ...(next.delays ?? [])];
  // The phase starts now, and so does its first task.
  if (titles.length > 0) await db.task.createMany({ data: taskRows(pr.id, created.id, titles, delays, now) });
  await db.project.update({ where: { id: pr.id }, data: { pendingPhases: rest.length > 0 ? (rest as never) : ([] as never) } });
}

// Issues (as a DRAFT, awaiting approval) the invoice for one instalment of the
// accepted proposal. Idempotent: an instalment already invoiced is skipped.
// `which`: a 1-based row number, "middle" (every instalment between the first
// and the last) or "last".
export async function ensureInstalmentInvoices(db: PrismaClient, projectId: string, which: number | "middle" | "last"): Promise<void> {
  const proposal = await db.proposal.findFirst({
    where: { projectId, status: "ACCEPTED", paymentSchedule: { some: {} } },
    orderBy: { respondedAt: "desc" },
    include: { paymentSchedule: { orderBy: { order: "asc" } }, invoices: { select: { instalmentId: true } } },
  });
  if (!proposal) return;
  const rows = proposal.paymentSchedule;
  const grand = proposal.subtotal + proposal.taxAmount;
  const wanted = rows.filter((_, i) =>
    which === "last" ? i === rows.length - 1 : which === "middle" ? i > 0 && i < rows.length - 1 : i === which - 1
  );
  const round = (n: number) => Math.round(n * 100) / 100;
  for (const row of wanted) {
    if (proposal.invoices.some((inv) => inv.instalmentId === row.id)) continue;
    const share = row.percentage != null ? row.percentage / 100 : grand > 0 && row.amount != null ? row.amount / grand : 0;
    if (share <= 0) continue;
    const subtotal = round(proposal.subtotal * share);
    const tax = {
      gst: round(proposal.gstAmount * share),
      qst: round(proposal.qstAmount * share),
      hst: round(proposal.hstAmount * share),
    };
    const taxTotal = round(tax.gst + tax.qst + tax.hst);
    const due = row.dueDate ?? new Date(Date.now() + 15 * 86400000);
    const index = rows.findIndex((r) => r.id === row.id) + 1;
    const invoice = await db.invoice.create({
      data: {
        projectId,
        proposalId: proposal.id,
        instalmentId: row.id,
        status: "DRAFT",
        currency: proposal.currency,
        subtotal,
        gstAmount: tax.gst,
        qstAmount: tax.qst,
        hstAmount: tax.hst,
        taxAmount: taxTotal,
        totalAmount: round(subtotal + taxTotal),
        amount: round(subtotal + taxTotal),
        dueDate: due,
        // The 1st instalment's invoice is also the one the client is waiting on.
        notes: `${proposal.title} — instalment ${index} of ${rows.length}`,
      },
    });
    await db.invoice.update({ where: { id: invoice.id }, data: { number: `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${invoice.id.slice(-4).toUpperCase()}` } });
    await db.invoiceLineItem.create({
      data: { invoiceId: invoice.id, description: `${proposal.title} — ${row.label}${row.percentage != null ? ` (${row.percentage}%)` : ""}`, quantity: 1, unitPrice: subtotal, order: 0 },
    });
  }
  // Supplier costs paid since the proposal went out ride on this new invoice.
  await billPendingSupplierCosts(db, projectId);
}

async function setStatus(db: PrismaClient, projectId: string, status: "PLANNING" | "ACTIVE" | "FINAL" | "COMPLETED") {
  await db.project.update({ where: { id: projectId }, data: { status, ...(status === "COMPLETED" ? { completedAt: new Date() } : {}) } });
  // Linked projects (spawned from this one) follow the parent's status.
  await db.project.updateMany({ where: { parentProjectId: projectId, NOT: { status: "CANCELLED" } }, data: { status, ...(status === "COMPLETED" ? { completedAt: new Date() } : {}) } });
}

// One step of the lifecycle; true if something changed (so the caller loops).
async function step(db: PrismaClient, pr: Loaded): Promise<boolean> {
  const pending = asPending(pr.pendingPhases);
  const last = pr.phases[0];
  const lastFinished = !last || last.status === "COMPLETED" || (last.tasks.length > 0 && last.tasks.every((t) => t.status === "DONE"));
  const stageOf = (p?: PendingPhase) => p?.stage ?? "ACTIVE";
  const money = await instalmentState(db, pr.id);
  // The "2nd Instalment" phase carries its own tasks; otherwise a reminder task is added to the first active phase.
  const reminder = money.paid >= 2 ? undefined : SECOND_INSTALMENT_TASK;
  const secondFor = (p?: PendingPhase) => (stageOf(p) === "ACTIVE" && !(p && /2nd instalment/i.test(p.name)) ? reminder : undefined);

  switch (pr.status) {
    case "PROPOSAL": {
      // Accepted: the 1st instalment is now due — issue its invoice.
      if (money.accepted) await ensureInstalmentInvoices(db, pr.id, 1);
      if (!(money.accepted && money.paid >= 1)) return false;
      await closeLatestPhase(db, pr);
      await promoteContact(db, pr.contactId, "CLIENT");
      if (stageOf(pending[0]) === "PLANNING" && pending.length > 0) {
        await setStatus(db, pr.id, "PLANNING");
        await release(db, pr, pending);
      } else {
        // Nothing to research or mock up: straight to Active.
        await setStatus(db, pr.id, "ACTIVE");
        await ensureInstalmentInvoices(db, pr.id, "middle");
        if (pending.length > 0) await release(db, pr, pending, secondFor(pending[0]));
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
        await ensureInstalmentInvoices(db, pr.id, "middle");
        if (pending.length > 0) await release(db, pr, pending, secondFor(pending[0]));
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
        await ensureInstalmentInvoices(db, pr.id, "last");
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
