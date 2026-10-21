// Pure permission model, safe to import from client components (no server-only imports).
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

export const all = (level: Level): Permissions => Object.fromEntries(SECTIONS.map((s) => [s.key, level])) as Permissions;

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

