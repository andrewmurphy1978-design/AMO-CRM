import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
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
    { href: "/contacts", label: t.nav.contacts },
    { href: "/projects", label: t.nav.projects },
    { href: "/marketing", label: t.nav.marketing },
    { href: "/bookings", label: t.nav.bookings },
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
