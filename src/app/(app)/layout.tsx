import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { isPersonalSectionUser } from "@/lib/personal-watch";
import AppShell from "./app-shell";

async function handleSignOut() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // Route protection used to live in middleware (src/proxy.ts), but
  // NextAuth's `auth()`-wrapped middleware hits an unsupported edge case
  // under Cloudflare's (experimental) Node.js middleware support — see
  // DEPLOY.md. Gating here in the layout works identically everywhere and
  // covers every route under this group (i.e. everything except /login).
  if (!session) {
    redirect("/login");
  }

  const lang = await getLang();
  const t = getDict(lang);
  const NAV_ITEMS = [
    { href: "/", label: t.nav.dashboard },
    { href: "/email", label: t.nav.email },
    // Points at the CRM's own native calendar (linkable to clients/
    // projects/tasks/bookings) — the previous embedded Google Calendar
    // view is kept, unlinked, at /calendar as a fallback to revert to.
    { href: "/calendar-app", label: t.nav.calendar },
    { href: "/tasks", label: t.nav.tasks },
    { href: "/contacts", label: t.nav.contacts },
    { href: "/projects", label: t.nav.projects },
    { href: "/invoices", label: t.nav.invoices },
    { href: "/marketing", label: t.nav.marketing },
    { href: "/bookings", label: t.nav.bookings },
    // Visible only on Andrew's own account — family emails/events have no
    // business reason to show up for any other team member.
    ...(isPersonalSectionUser(session.user.email) ? [{ href: "/personal", label: t.nav.personal }] : []),
    { href: "/settings", label: t.nav.settings },
  ];

  return (
    <AppShell
      navItems={NAV_ITEMS}
      userName={session?.user?.name}
      userEmail={session?.user?.email}
      signOutLabel={t.nav.signOut}
      signOutAction={handleSignOut}
    >
      {children}
    </AppShell>
  );
}
