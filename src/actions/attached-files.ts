"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

export async function deleteAttachedFile(id: string): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const row = await withScopedPrismaClient(async (db) => {
    const r = await db.attachedFile.findUnique({ where: { id }, select: { contactId: true, projectId: true } });
    if (r) await db.attachedFile.delete({ where: { id } });
    return r;
  });
  if (row?.contactId) revalidatePath(`/contacts/${row.contactId}`);
  if (row?.projectId) revalidatePath(`/projects/${row.projectId}`);
}

export async function renameAttachedFile(id: string, name: string, note: string): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const clean = name.trim().slice(0, 200);
  if (!clean) return;
  const row = await withScopedPrismaClient((db) => db.attachedFile.update({ where: { id }, data: { name: clean, note: note.trim() || null }, select: { contactId: true, projectId: true } }));
  if (row.contactId) revalidatePath(`/contacts/${row.contactId}`);
  if (row.projectId) revalidatePath(`/projects/${row.projectId}`);
}
