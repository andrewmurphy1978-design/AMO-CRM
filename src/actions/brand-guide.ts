"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { generateBrandGuide } from "@/lib/brand-report";

// The "Create the brand guide (PDF)" task's button: builds the English and French PDF guides (written with AI) from the reports on the Brand card.
export async function createBrandGuidePdf(projectId: string): Promise<{ error?: string; fileNames?: string[]; reports?: number }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const res = await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { contactId: true } });
    if (!project) return { error: "Project not found.", contactId: null as string | null };
    return { ...(await generateBrandGuide(db, project.contactId, projectId)), contactId: project.contactId as string | null };
  });
  revalidatePath(`/projects/${projectId}`);
  if ("contactId" in res && res.contactId) revalidatePath(`/contacts/${res.contactId}`);
  return { error: res.error, fileNames: "fileNames" in res ? res.fileNames : undefined, reports: "reports" in res ? res.reports : undefined };
}
