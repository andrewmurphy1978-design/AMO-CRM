"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { assignMissingFolders, getLocalRoot, moveRoot } from "@/lib/local-folders";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") throw new Error("Only admins can change this setting");
  return session;
}

// Settings > Local files: where the client folders live on the computer (e.g. C:\Users\Andrew\Clients).
export async function saveLocalFilesRoot(_prev: { error?: string; success?: string } | undefined, formData: FormData): Promise<{ error?: string; success?: string }> {
  await requireAdmin();
  const root = String(formData.get("root") ?? "").trim().replace(/[\\/]+$/, "");
  if (root && !/^([a-zA-Z]:[\\/]|\\\\|\/|~)/.test(root)) return { error: "Give a full path, such as C:\\Users\\Andrew\\Clients or /Users/andrew/Clients." };
  const counts = await withScopedPrismaClient(async (db) => {
    const old = await getLocalRoot(db);
    await db.billingSettings.upsert({ where: { id: "singleton" }, update: { localFilesRoot: root || null }, create: { id: "singleton", localFilesRoot: root || null } });
    if (old && root) await moveRoot(db, old, root);
    return root ? await assignMissingFolders(db) : { contacts: 0, projects: 0 };
  });
  revalidatePath("/settings");
  revalidatePath("/contacts", "layout");
  revalidatePath("/projects", "layout");
  return { success: root ? `Saved. ${counts.contacts} client folder path(s) and ${counts.projects} project folder path(s) were set.` : "Saved (no local folder)." };
}

// Editing a contact's or project's folder path by hand.
export async function setFolderPath(kind: "contact" | "project", id: string, path: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const clean = path.trim();
  await withScopedPrismaClient(async (db) => {
    if (kind === "contact") await db.contact.update({ where: { id }, data: { folderPath: clean || null, folderCreatedAt: null } });
    else await db.project.update({ where: { id }, data: { folderPath: clean || null, folderCreatedAt: null } });
  });
  revalidatePath(kind === "contact" ? `/contacts/${id}` : `/projects/${id}`);
  return {};
}
