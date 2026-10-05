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
