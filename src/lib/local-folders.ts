import type { PrismaClient } from "@/lib/prisma";

// Local client files: Settings stores the folder where they live on the team's computer. Every
// contact gets a sub-folder (<root>/<client>) and every project a sub-folder of its client's
// (<root>/<client>/<project>). The CRM runs online, so it can only store the PATHS (Contact.folderPath,
// Project.folderPath); the folders themselves are created on the computer by the browser (see
// components/local-folder-sync.tsx) and flagged with folderCreatedAt once they exist.

// Windows forbids < > : " / \ | ? * and trailing dots / spaces; other systems forbid "/" only.
export function folderName(raw: string, fallback = "Untitled"): string {
  const cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .trim();
  return cleaned || fallback;
}

export function sepOf(root: string): string {
  return root.includes("\\") && !root.includes("/") ? "\\" : "/";
}

export function joinFolder(root: string, ...parts: string[]): string {
  const sep = sepOf(root);
  return [root.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

export function contactFolderName(c: { company: string | null; firstName: string | null; lastName: string | null; email: string | null }): string {
  return folderName(c.company || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "", "Contact");
}

export async function getLocalRoot(db: PrismaClient): Promise<string | null> {
  const s = await db.billingSettings.findUnique({ where: { id: "singleton" }, select: { localFilesRoot: true } });
  return s?.localFilesRoot?.trim() || null;
}

// Gives a contact its folder path (nothing changes if it already has one or no root is set).
export async function ensureContactFolder(db: PrismaClient, contactId: string): Promise<string | null> {
  const c = await db.contact.findUnique({ where: { id: contactId }, select: { folderPath: true, company: true, firstName: true, lastName: true, email: true } });
  if (!c) return null;
  if (c.folderPath) return c.folderPath;
  const root = await getLocalRoot(db);
  if (!root) return null;
  const path = joinFolder(root, contactFolderName(c));
  await db.contact.update({ where: { id: contactId }, data: { folderPath: path, folderCreatedAt: null } });
  return path;
}

// Gives a project its folder path, inside its client's folder.
export async function ensureProjectFolder(db: PrismaClient, projectId: string): Promise<string | null> {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { folderPath: true, name: true, contactId: true } });
  if (!p) return null;
  if (p.folderPath) return p.folderPath;
  const contactPath = await ensureContactFolder(db, p.contactId);
  if (!contactPath) return null;
  const path = joinFolder(contactPath, folderName(p.name, "Project"));
  await db.project.update({ where: { id: projectId }, data: { folderPath: path, folderCreatedAt: null } });
  return path;
}

// Existing contacts and projects without a folder (after the setting is first filled in).
export async function assignMissingFolders(db: PrismaClient): Promise<{ contacts: number; projects: number }> {
  const root = await getLocalRoot(db);
  if (!root) return { contacts: 0, projects: 0 };
  const contacts = await db.contact.findMany({ where: { folderPath: null }, select: { id: true, company: true, firstName: true, lastName: true, email: true } });
  for (let i = 0; i < contacts.length; i += 100) {
    await db.$transaction(contacts.slice(i, i + 100).map((c) => db.contact.update({ where: { id: c.id }, data: { folderPath: joinFolder(root, contactFolderName(c)), folderCreatedAt: null } })));
  }
  const projects = await db.project.findMany({ where: { folderPath: null }, select: { id: true, name: true, contact: { select: { folderPath: true } } } });
  const withClient = projects.filter((p) => p.contact.folderPath);
  for (let i = 0; i < withClient.length; i += 100) {
    await db.$transaction(withClient.slice(i, i + 100).map((p) => db.project.update({ where: { id: p.id }, data: { folderPath: joinFolder(p.contact.folderPath as string, folderName(p.name, "Project")), folderCreatedAt: null } })));
  }
  // Projects whose contact only just got its path above.
  const rest = await db.project.findMany({ where: { folderPath: null }, select: { id: true, name: true, contact: { select: { folderPath: true } } } });
  const more = rest.filter((p) => p.contact.folderPath);
  for (let i = 0; i < more.length; i += 100) {
    await db.$transaction(more.slice(i, i + 100).map((p) => db.project.update({ where: { id: p.id }, data: { folderPath: joinFolder(p.contact.folderPath as string, folderName(p.name, "Project")), folderCreatedAt: null } })));
  }
  return { contacts: contacts.length, projects: withClient.length + more.length };
}

// The root changed: every saved path moves to the new root (and its folders are created again).
export async function moveRoot(db: PrismaClient, oldRoot: string, newRoot: string): Promise<void> {
  const o = oldRoot.replace(/[\\/]+$/, "");
  const n = newRoot.replace(/[\\/]+$/, "");
  if (!o || o === n) return;
  const fix = (p: string | null) => (p && p.startsWith(o) ? n + p.slice(o.length) : p);
  for (const table of ["contact", "project"] as const) {
    const rows = await (table === "contact" ? db.contact.findMany({ where: { folderPath: { startsWith: o } }, select: { id: true, folderPath: true } }) : db.project.findMany({ where: { folderPath: { startsWith: o } }, select: { id: true, folderPath: true } }));
    for (let i = 0; i < rows.length; i += 100) {
      await db.$transaction(
        rows.slice(i, i + 100).map((r) =>
          table === "contact" ? db.contact.update({ where: { id: r.id }, data: { folderPath: fix(r.folderPath), folderCreatedAt: null } }) : db.project.update({ where: { id: r.id }, data: { folderPath: fix(r.folderPath), folderCreatedAt: null } })
        )
      );
    }
  }
}
