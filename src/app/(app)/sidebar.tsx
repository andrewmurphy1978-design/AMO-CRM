"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import NavLink from "./nav-link";

const AMO_LOGO_URL =
  "https://d1yei2z3i6k35z.cloudfront.net/18410699/6a596ef4e08523.10636812_AMOBadgeTransparentwithAMOonly.png";

export default function Sidebar({
  navItems,
  userName,
  userEmail,
  signOutLabel,
  signOutAction,
}: {
  navItems: { href: string; label: string }[];
  userName?: string | null;
  userEmail?: string | null;
  signOutLabel: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  // The Dashboard's 3-column layout wants the horizontal space back, so the
  // sidebar starts collapsed there — but stays a manual toggle everywhere
  // it's shown, not a one-way setting, so leaving the dashboard restores it.
  // Re-deriving this on route change is a render-phase state adjustment
  // (React's sanctioned alternative to an effect for this), not an effect,
  // so it can't cascade an extra render.
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [collapsed, setCollapsed] = useState(pathname === "/");
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setCollapsed(pathname === "/");
  }

  if (collapsed) {
    return (
      <aside className="hidden w-16 shrink-0 flex-col items-center gap-3 bg-amo-green py-4 sm:sticky sm:top-0 sm:z-10 sm:flex sm:h-screen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={AMO_LOGO_URL} alt="Andrew Murphy Online" className="h-9 w-9 rounded-full" />
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show sidebar"
          className="flex h-8 w-8 items-center justify-center rounded-md text-amo-muted transition-colors hover:bg-white/10 hover:text-amo-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto bg-amo-green sm:sticky sm:top-0 sm:z-10 sm:flex sm:h-screen">
      <div className="relative flex flex-col items-center gap-2 border-b border-white/10 px-4 py-6">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Hide sidebar"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-amo-muted transition-colors hover:bg-white/10 hover:text-amo-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={AMO_LOGO_URL} alt="Andrew Murphy Online" className="h-auto w-full" />
        <p className="font-display text-lg font-semibold tracking-wide text-amo-white">CRM</p>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-medium text-amo-white">{userName}</p>
        <p className="truncate text-xs text-amo-muted">{userEmail}</p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-2 text-xs font-medium text-amo-muted transition-colors hover:text-amo-lime"
          >
            {signOutLabel}
          </button>
        </form>
      </div>
    </aside>
  );
}
