import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

// Access to each section of the CRM, per team member: none, read only, read & write, or read, write & delete.
// Admins always have everything. A member with nothing set keeps the access members have always had (everything,
// Accounting aside, which has its own switch); the Team screen in Settings writes an explicit level per section.

export type Level = "NONE" | "READ" | "WRITE" | "DELETE";
export const LEVELS: Level[] = ["NONE", "READ", "WRITE", "DELETE"];
const RANK: Record<Level, number> = { NONE: 0, READ: 1, WRITE: 2, DELETE: 3 };

export const SECTIONS = [
  { key: "dashboard", nav: "dashboard", href: "/" },
  { key: "email", nav: "email", href: "/email" },
  { key: "sms", nav: "sms", href: "/sms" },
  { key: "calendar", nav: "calendar", href: "/calendar-app" },
  { key: "tasks", nav: "tasks", href: "/tasks" },
  { key: "contacts", nav: "contacts", href: "/contacts" },
  { key: "projects", nav: "projects", href: "/projects" },
  { key: "invoices", nav: "invoices", href: "/invoices" },
  { key: "accounting", nav: "accounting", href: "/accounting" },
  { key: "marketing", nav: "marketing", href: "/marketing" },
  { key: "socialAnalytics", nav: "socialAnalytics", href: "/social-analytics" },
  { key: "bookings", nav: "bookings", href: "/bookings" },
  { key: "settings", nav: "settings", href: "/settings" },
] as const;

export type Section = (typeof SECTIONS)[number]["key"];

export type Permissions = Record<Section, Level>;

export const atLeast = (have: Level, need: Level) => RANK[have] >= RANK[need];

const all = (level: Level): Permissions => Object.fromEntries(SECTIONS.map((s) => [s.key, level])) as Permissions;

/** A member's access to every section. */
export function resolvePermissions(u: { role: string; permissions?: unknown; accountingAccess?: boolean; accountingOnly?: boolean }): Permissions {
  if (u.role === "ADMIN") return all("DELETE");
  const explicit = (u.permissions && typeof u.permissions === "object" ? (u.permissions as Record<string, string>) : null);
  let p: Permissions;
  if (explicit) {
    p = all("NONE");
    for (const s of SECTIONS) {
      const v = explicit[s.key];
      if (v && (LEVELS as string[]).includes(v)) p[s.key] = v as Level;
    }
  } else if (u.accountingOnly) {
    p = { ...all("NONE"), accounting: "DELETE", settings: "WRITE" };
  } else {
    p = { ...all("DELETE"), accounting: u.accountingAccess ? "DELETE" : "NONE", settings: "WRITE" };
  }
  return p;
}

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
