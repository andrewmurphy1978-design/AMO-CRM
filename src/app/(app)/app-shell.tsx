"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";

const AMO_BADGE_URL = "https://d1yei2z3i6k35z.cloudfront.net/18410699/6a596c0abdbde8.23945126_AMOBadgeTransparent.png";

export default function AppShell({
  navItems,
  userName,
  userEmail,
  signOutLabel,
  signOutAction,
  children,
}: {
  navItems: { href: string; label: string }[];
  userName?: string | null;
  userEmail?: string | null;
  signOutLabel: string;
  signOutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // The Dashboard's 3-column layout, and the Calendar page's own grid
  // views, both want the horizontal space back, so the sidebar starts
  // collapsed on either — but stays a manual toggle everywhere it's
  // shown, not a one-way setting, so leaving them restores it.
  // Re-deriving this on route change is a render-phase state adjustment
  // (React's sanctioned alternative to an effect for this), not an effect,
  // so it can't cascade an extra render.
  const autoCollapse = (p: string) => p === "/" || p === "/calendar-app" || p === "/email";
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [collapsed, setCollapsed] = useState(autoCollapse(pathname));
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setCollapsed(autoCollapse(pathname));
  }

  // The fixed-position background (globals.css `.amo-bg-image--app`) reads
  // this variable to offset itself past the sidebar, whatever width it
  // currently is — set here, during render, so server and first client
  // paint always agree and there's never a frame where they disagree.
  const shellStyle = { "--sidebar-w": collapsed ? "4rem" : "16rem" } as CSSProperties;

  return (
    <div className="flex min-h-screen" style={shellStyle}>
      <Sidebar
        navItems={navItems}
        userName={userName}
        userEmail={userEmail}
        signOutLabel={signOutLabel}
        signOutAction={signOutAction}
        collapsed={collapsed}
        onToggle={setCollapsed}
        hideLogo={pathname === "/"}
      />

      <div className="relative flex flex-1 flex-col">
        <div className="amo-bg-image amo-bg-image--app" />
        <div className="amo-bg-overlay amo-bg-overlay--app" />
        <header className="relative z-10 flex items-center justify-between bg-amo-green px-4 py-3 sm:hidden">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={AMO_BADGE_URL} alt="Andrew Murphy Online" className="h-7 w-7 object-contain" />
            <span className="font-display text-sm font-semibold text-amo-white">CRM</span>
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="text-xs font-medium text-amo-muted">
              {signOutLabel}
            </button>
          </form>
        </header>
        <main className="relative z-10 flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
