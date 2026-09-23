"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";

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
  const autoCollapse = (p: string) => p === "/" || p === "/calendar-app" || p === "/email" || p === "/contacts";
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
        <main className="relative z-10 flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
