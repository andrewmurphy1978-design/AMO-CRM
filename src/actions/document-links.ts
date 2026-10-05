"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

export type DocumentKind = "proposal" | "invoice";
export type LinkableKind = "email" | "event" | "call";

// Links (or unlinks) one of the project's emails / calendar events / calls & texts
// to a proposal or an invoice. `itemId` is the EmailLink id, the Google event id,
// or the Interaction id.
export async function toggleDocumentLink(
  kind: DocumentKind,
  docId: string,
  projectId: string,
  item: LinkableKind,
  itemId: string,
  linked: boolean
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const data = kind === "proposal" ? { proposalId: linked ? docId : null } : { invoiceId: linked ? docId : null };
  const ok = await withScopedPrismaClient(async (db) => {
    const doc = kind === "proposal" ? await db.proposal.findUnique({ where: { id: docId }, select: { projectId: true } }) : await db.invoice.findUnique({ where: { id: docId }, select: { projectId: true } });
    if (!doc || doc.projectId !== projectId) return false;
    if (item === "email") await db.emailLink.updateMany({ where: { id: itemId, projectId }, data });
    else if (item === "event") await db.calendarEventLink.updateMany({ where: { googleEventId: itemId, projectId }, data });
    else await db.interaction.updateMany({ where: { id: itemId, projectId }, data });
    return true;
  });
  if (!ok) return { error: "Document not found." };
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// ---- from the email / calendar side: pick the proposal / invoice an item belongs to

export type LinkedItem = { type: "email"; id: string } | { type: "event"; id: string }; // Gmail thread id / Google event id

export interface ProjectDocuments {
  proposals: { id: string; label: string }[];
  invoices: { id: string; label: string }[];
  proposalId: string;
  invoiceId: string;
  // False when the email / event isn't linked to this project yet (save the link first).
  linkedToProject: boolean;
}

// The project's proposals and invoices, and the ones this email thread / calendar event is
// linked to now.
export async function listProjectDocuments(projectId: string, item: LinkedItem): Promise<ProjectDocuments> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  return withScopedPrismaClient(async (db) => {
    const [proposals, invoices] = await Promise.all([
      db.proposal.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, status: true } }),
      db.invoice.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, select: { id: true, number: true, status: true, totalAmount: true, currency: true } }),
    ]);
    const link =
      item.type === "email"
        ? await db.emailLink.findUnique({ where: { gmailThreadId: item.id }, select: { projectId: true, proposalId: true, invoiceId: true } })
        : await db.calendarEventLink.findUnique({ where: { googleEventId: item.id }, select: { projectId: true, proposalId: true, invoiceId: true } });
    return {
      proposals: proposals.map((p) => ({ id: p.id, label: `${p.title} (${p.status})` })),
      invoices: invoices.map((i) => ({ id: i.id, label: `${i.number || "Invoice"} — ${i.totalAmount.toFixed(2)} ${i.currency} (${i.status})` })),
      proposalId: link?.proposalId ?? "",
      invoiceId: link?.invoiceId ?? "",
      linkedToProject: Boolean(link && link.projectId === projectId),
    };
  });
}

// Links the email thread / calendar event to a proposal or invoice of the project ("" unlinks).
export async function setItemDocumentLink(item: LinkedItem, projectId: string, kind: DocumentKind, docId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const data = kind === "proposal" ? { proposalId: docId || null } : { invoiceId: docId || null };
  const result = await withScopedPrismaClient(async (db) => {
    if (docId) {
      const doc = kind === "proposal" ? await db.proposal.findUnique({ where: { id: docId }, select: { projectId: true } }) : await db.invoice.findUnique({ where: { id: docId }, select: { projectId: true } });
      if (!doc || doc.projectId !== projectId) return "Document not found.";
    }
    const res =
      item.type === "email"
        ? await db.emailLink.updateMany({ where: { gmailThreadId: item.id, projectId }, data })
        : await db.calendarEventLink.updateMany({ where: { googleEventId: item.id, projectId }, data });
    return res.count > 0 ? null : "Save the link to the project first.";
  });
  if (result) return { error: result };
  revalidatePath(`/projects/${projectId}`);
  return {};
}
