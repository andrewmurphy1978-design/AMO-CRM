import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

// Access to each section of the CRM, per team member: none, read only, read & write, or read, write & delete.
// Admins always have everything. A member with nothing set keeps the access members have always had (everything,
// Accounting aside, which has its own switch); the Team screen in Settings writes an explicit level per section.

import { SECTIONS, LEVELS, atLeast, resolvePermissions, all, type Level, type Section, type Permissions } from "./permissions-shared";
export { SECTIONS, LEVELS, atLeast, resolvePermissions };
export type { Level, Section, Permissions };

export async function currentPermissions(): Promise<{ userId: string; admin: boolean; perms: Permissions } | null> {
  const session = await auth();
  if (!session) return null;
  if (session.user.role === "ADMIN") return { userId: session.user.id, admin: true, perms: all("DELETE") };
  const u = await withScopedPrismaClient((db) => db.user.findUnique({ where: { id: session.user.id }, select: { role: true, permissions: true, accountingAccess: true, accountingOnly: true } }));
  if (!u) return null;
  return { userId: session.user.id, admin: false, perms: resolvePermissions(u) };
}

/** For pages and layouts: sends the user away when they cannot read the section. */
export async function requireSection(section: Section, need: Level = "READ"): Promise<Level> {
  const me = await currentPermissions();
  if (!me) redirect("/login");
  const have = me.perms[section];
  if (!atLeast(have, need)) {
    const first = SECTIONS.find((s) => atLeast(me.perms[s.key], "READ"));
    if (first && first.href !== (section === "dashboard" ? "/" : SECTIONS.find((s) => s.key === section)?.href)) redirect(first.href);
    notFound();
  }
  return have;
}

/** For server actions: throws when the user may not do this to the section. */
export async function requireAccess(section: Section, need: Level): Promise<void> {
  const me = await currentPermissions();
  if (!me) throw new Error("Not authenticated");
  if (!atLeast(me.perms[section], need)) {
    throw new Error(need === "DELETE" ? "You do not have permission to delete in this section." : need === "WRITE" ? "You have read-only access to this section." : "You do not have access to this section.");
  }
}
