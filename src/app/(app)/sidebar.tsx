"use client";

import NavLink from "./nav-link";

// Full lockup (icon + "Andrew Murphy Online" wordmark) — wide, meant to run
// the width of the expanded sidebar. Forcing it into a small square (as a
// prior version of this file did) squished the wordmark into it.
const AMO_LOGO_URL =
  "https://d1yei2z3i6k35z.cloudfront.net/18410699/6a596ef4e08523.10636812_AMOBadgeTransparentwithAMOonly.png";
// Icon-only badge — used wherever space is too narrow for the full lockup.
const AMO_BADGE_URL = "https://d1yei2z3i6k35z.cloudfront.net/18410699/6a596c0abdbde8.23945126_AMOBadgeTransparent.png";

// Fixed height for the logo block at the top of the sidebar, in every state
// (full lockup, badge-only when collapsed, or hidden entirely on the
// Dashboard, which shows the lockup in its own header instead) — so nav
// links below it always start at the same Y position instead of jumping
// up when the logo shrinks or disappears.
const LOGO_AREA_HEIGHT = "h-20";

export default function Sidebar({
  navItems,
  userName,
  userEmail,
  signOutLabel,
  signOutAction,
  collapsed,
  onToggle,
  hideLogo = false,
}: {
  navItems: { href: string; label: string }[];
  userName?: string | null;
  userEmail?: string | null;
  signOutLabel: string;
  signOutAction: () => Promise<void>;
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  hideLogo?: boolean;
}) {
  // Phones always get this same icon-only rail regardless of the desktop
  // collapsed/expanded toggle below — before this, the sidebar (in either
  // state) was `hidden` under the `sm` breakpoint entirely, so there was no
  // way at all to navigate between pages on a phone besides the browser's
  // back button. `sticky top-0 h-screen` (same as the desktop aside below)
  // pins it in place so it stays visible while the main content scrolls,
  // instead of scrolling away with the page as an ordinary flex child
  // would. Sign-out lives here too, as an icon at the bottom — this used
  // to be its own separate "CRM" + text-link header bar above the main
  // content (app-shell.tsx); folding both into the rail means there's only
  // ever one mobile nav surface, not two stacked on top of each other.
  const mobileRail = (
    <aside className="sticky top-0 z-10 flex h-screen w-14 shrink-0 flex-col bg-amo-green sm:hidden">
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-white/10">
        {!hideLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={AMO_BADGE_URL} alt="Andrew Murphy Online" className="h-7 w-7 object-contain" />
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-1.5 py-3">
        {navItems.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} collapsed />
        ))}
      </nav>
      <form action={signOutAction} className="shrink-0 border-t border-white/10 p-2">
        <button
          type="submit"
          aria-label={signOutLabel}
          title={signOutLabel}
          className="flex w-full items-center justify-center rounded-md p-2 text-amo-muted transition-colors hover:bg-white/10 hover:text-amo-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3-6 3 3m0 0-3 3m3-3H9"
            />
          </svg>
        </button>
      </form>
    </aside>
  );

  if (collapsed) {
    return (
      <>
        {mobileRail}
        <aside className="hidden w-16 shrink-0 flex-col bg-amo-green sm:sticky sm:top-0 sm:z-10 sm:flex sm:h-screen">
          <div className={`relative flex ${LOGO_AREA_HEIGHT} shrink-0 flex-col items-center justify-start border-b border-white/10 px-2 pt-3`}>
            {!hideLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={AMO_BADGE_URL} alt="Andrew Murphy Online" className="h-9 w-9 object-contain" />
            )}
            <button
              type="button"
              onClick={() => onToggle(false)}
              aria-label="Show sidebar"
              className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-md text-amo-muted transition-colors hover:bg-white/10 hover:text-amo-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navItems.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} collapsed />
            ))}
          </nav>
        </aside>
      </>
    );
  }

  return (
    <>
      {mobileRail}
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto bg-amo-green sm:sticky sm:top-0 sm:z-10 sm:flex sm:h-screen">
      <div className={`relative flex ${LOGO_AREA_HEIGHT} shrink-0 flex-col items-center justify-start border-b border-white/10 px-4 pt-2`}>
        {!hideLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={AMO_LOGO_URL} alt="Andrew Murphy Online" className="h-auto max-h-14 w-full object-contain" />
        )}
        <button
          type="button"
          onClick={() => onToggle(true)}
          aria-label="Hide sidebar"
          className="absolute bottom-1 right-2 flex h-7 w-7 items-center justify-center rounded-md text-amo-muted transition-colors hover:bg-white/10 hover:text-amo-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
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
    </>
  );
}
