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
    // min-h-dvh, not min-h-screen (100vh): vh is sized against the
    // largest possible mobile viewport (address bar hidden), taller than
    // what's actually visible once the address bar shows. Every page
    // inherits its minimum height from this one root wrapper, so a page
    // whose real content is shorter than that inflated vh value (a short
    // Contacts list, or the Calendar widget once its own internal sizing
    // is otherwise correct) stretched to fill it anyway — leaving genuine
    // blank space below the real content that the page could then scroll
    // into, on every page at once, not anything specific to Calendar.
    <div className="flex min-h-dvh" style={shellStyle}>
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

      {/* `pl-14` (only below `sm`) reserves the width the fixed-position
          mobile rail no longer claims through normal flex flow now that
          it's taken out of document flow — see Sidebar's mobileRail. The
          background layers inside are `position: fixed` themselves, so
          this padding doesn't shift them; they get their own matching
          offset from the `max-width: 639px` rule in globals.css.
          `min-w-0` is required here: a flex item's default min-width is
          "auto" (its content's own min-content size), so without it, any
          page content with a wide non-wrapping row (e.g. a long, unbroken
          header title or label) would force this whole column — and with
          it, the entire flex row — wider than the actual viewport. The
          overflow-x-clip on <html>/<body> then hides that overflow
          instead of scrolling to it, so the symptom isn't a scrollbar,
          it's page content silently clipped off past the right edge. */}
      <div className="relative flex min-w-0 flex-1 flex-col pl-14 sm:pl-0">
        <div className="amo-bg-image amo-bg-image--app" />
        <div className="amo-bg-overlay amo-bg-overlay--app" />
        <main className="relative z-10 flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
