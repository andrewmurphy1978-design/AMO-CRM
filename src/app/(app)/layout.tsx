import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import NavLink from "./nav-link";

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
    { href: "/settings", label: t.nav.settings },
  ];

  const AMO_LOGO_URL =
    "https://d1yei2z3i6k35z.cloudfront.net/18410699/6a596ef4e08523.10636812_AMOBadgeTransparentwithAMOonly.png";

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto bg-amo-green sm:sticky sm:top-0 sm:z-10 sm:flex sm:h-screen">
        <div className="flex flex-col items-center gap-2 border-b border-white/10 px-4 py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AMO_LOGO_URL} alt="Andrew Murphy Online" className="h-auto w-full" />
          <p className="font-display text-lg font-semibold tracking-wide text-amo-white">CRM</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium text-amo-white">{session?.user?.name}</p>
          <p className="truncate text-xs text-amo-muted">{session?.user?.email}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="mt-2 text-xs font-medium text-amo-muted transition-colors hover:text-amo-lime"
            >
              {t.nav.signOut}
            </button>
          </form>
        </div>
      </aside>

      <div className="relative flex flex-1 flex-col">
        <div className="amo-bg-image amo-bg-image--app" />
        <div className="amo-bg-overlay amo-bg-overlay--app" />
        <header className="relative z-10 flex items-center justify-between bg-amo-green px-4 py-3 sm:hidden">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={AMO_LOGO_URL} alt="Andrew Murphy Online" className="h-7 w-7" />
            <span className="font-display text-sm font-semibold text-amo-white">CRM</span>
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-xs font-medium text-amo-muted">
              {t.nav.signOut}
            </button>
          </form>
        </header>
        <main className="relative z-10 flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
