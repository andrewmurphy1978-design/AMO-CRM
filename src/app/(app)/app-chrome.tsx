import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { currentPermissions, atLeast, type Section } from "@/lib/permissions";
import { isPersonalSectionUser } from "@/lib/personal-watch";
import AppShell from "./app-shell";
import { LangProvider } from "@/components/lang-context";
import LocalFolderSync from "@/components/local-folder-sync";

async function handleSignOut() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AppChrome({ children }: { children: React.ReactNode }) {
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
  const me = await currentPermissions();
  const can = (section: Section) => !!me && atLeast(me.perms[section], "READ");
  const NAV_ITEMS = [
    ...(can("dashboard") ? [{ href: "/", label: t.nav.dashboard }] : []),
    ...(can("email") ? [{ href: "/email", label: t.nav.email }] : []),
    ...(can("sms") ? [{ href: "/sms", label: t.nav.sms }] : []),
    // Points at the CRM's own native calendar (linkable to clients/
    // projects/tasks/bookings) — the previous embedded Google Calendar
    // view is kept, unlinked, at /calendar as a fallback to revert to.
    ...(can("calendar") ? [{ href: "/calendar-app", label: t.nav.calendar }] : []),
    ...(can("tasks") ? [{ href: "/tasks", label: t.nav.tasks }] : []),
    ...(can("contacts") ? [{ href: "/contacts", label: t.nav.contacts }] : []),
    ...(can("projects") ? [{ href: "/projects", label: t.nav.projects }] : []),
    ...(can("invoices") ? [{ href: "/invoices", label: t.nav.invoices }] : []),
    ...(can("accounting") ? [{ href: "/accounting", label: t.nav.accounting }] : []),
    ...(can("marketing") ? [{ href: "/marketing", label: t.nav.marketing }] : []),
    ...(can("socialAnalytics") ? [{ href: "/social-analytics", label: t.nav.socialAnalytics }] : []),
    ...(can("bookings") ? [{ href: "/bookings", label: t.nav.bookings }] : []),
    // Visible only on Andrew's own account — family emails/events have no
    // business reason to show up for any other team member.
    ...(isPersonalSectionUser(session.user.email) ? [{ href: "/personal", label: t.nav.personal }] : []),
    ...(can("settings") ? [{ href: "/settings", label: t.nav.settings }] : []),
  ];


  return (
    <AppShell
      navItems={NAV_ITEMS}
      userName={session?.user?.name}
      userEmail={session?.user?.email}
      signOutLabel={t.nav.signOut}
      signOutAction={handleSignOut}
    >
      <LangProvider lang={lang}>{children}</LangProvider>
      <LocalFolderSync lang={lang} />
    </AppShell>
  );
}
