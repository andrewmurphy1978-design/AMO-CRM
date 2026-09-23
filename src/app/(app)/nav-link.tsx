"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "@/lib/clsx";

// Keyed by href so the icon follows the route regardless of the (localized)
// label text. Same thin-stroke style as the dashboard's stat card icons.
const NAV_ICON_PATHS: Record<string, string> = {
  "/": "M2.25 12l8.954-8.955a1.5 1.5 0 0 1 2.122 0l8.954 8.955M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75",
  "/contacts":
    "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  "/projects":
    "M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-19.5 0v6a2.25 2.25 0 0 0 2.25 2.25h15a2.25 2.25 0 0 0 2.25-2.25v-6m-19.5 0h19.5M12 6.75h.008v.008H12V6.75Z",
  "/marketing":
    "M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244",
  "/bookings":
    "M6.75 3v2.25m10.5-2.25v2.25M3.75 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h12a2.25 2.25 0 0 1 2.25 2.25v11.25m-16.5 0a2.25 2.25 0 0 0 2.25 2.25h12a2.25 2.25 0 0 0 2.25-2.25m-16.5 0v-7.5a2.25 2.25 0 0 1 2.25-2.25h12a2.25 2.25 0 0 1 2.25 2.25v7.5",
  "/calendar-app":
    "M6.75 3v2.25m10.5-2.25v2.25M3.75 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h12a2.25 2.25 0 0 1 2.25 2.25v11.25m-16.5 0a2.25 2.25 0 0 0 2.25 2.25h12a2.25 2.25 0 0 0 2.25-2.25m-16.5 0v-7.5a2.25 2.25 0 0 1 2.25-2.25h12a2.25 2.25 0 0 1 2.25 2.25v7.5m-13.5 3.75h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Zm3-3h.008v.008H9.75V15Zm0 3h.008v.008H9.75V18Zm3-3h.008v.008H12.75V15Zm0 3h.008v.008H12.75V18Zm3-3h.008v.008h-.008V15Zm0 3h.008v.008h-.008V18Z",
  "/tasks":
    "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  "/invoices":
    "M9 14.25 6.75 12M6.75 12l2.25-2.25M6.75 12h10.5M13.5 5.25h5.25a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25H13.5m-9-13.5H3v13.5h1.5",
  "/email":
    "M2.25 6.75c0-.621.504-1.125 1.125-1.125h17.25c.621 0 1.125.504 1.125 1.125v10.5c0 .621-.504 1.125-1.125 1.125H3.375A1.125 1.125 0 0 1 2.25 17.25V6.75Zm0 0 9.75 6.75 9.75-6.75",
  "/personal":
    "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z",
  "/settings":
    "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.992l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a7.696 7.696 0 0 1 0-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z",
};

// Settings' gear icon needs a second inner circle path alongside the outer
// cog outline above.
const NAV_ICON_EXTRA_PATHS: Record<string, string> = {
  "/settings": "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
};

export default function NavLink({
  href,
  label,
  collapsed = false,
}: {
  href: string;
  label: string;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  const iconPath = NAV_ICON_PATHS[href];
  const extraPath = NAV_ICON_EXTRA_PATHS[href];

  return (
    <Link
      href={href}
      // None of these routes have a loading.tsx boundary, and every one
      // does real Prisma work behind auth() — Next's default Link
      // prefetch has no suspense boundary to stop at, so it runs each
      // destination's *full* server-rendered page (every query and all)
      // in the background as soon as the link is on screen, which for a
      // nav rendering every route at once means every page's data gets
      // fetched on every navigation whether the user goes there or not.
      // That's exactly the kind of concurrent-request pressure this app
      // has hit Cloudflare's Error 1102 resource limit from before (see
      // withScopedPrismaClient's own comments) — disabling it here trades
      // a little perceived navigation speed for not silently multiplying
      // the DB load on every single page view.
      prefetch={false}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={clsx(
        "flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150",
        collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2",
        active
          ? "bg-gradient-to-r from-amo-lime/20 to-amo-teal/10 text-amo-white shadow-[inset_2px_0_0_0_var(--amo-lime)]"
          : "text-amo-muted hover:bg-white/5 hover:text-amo-white"
      )}
    >
      {iconPath && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          {extraPath && <path strokeLinecap="round" strokeLinejoin="round" d={extraPath} />}
        </svg>
      )}
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
