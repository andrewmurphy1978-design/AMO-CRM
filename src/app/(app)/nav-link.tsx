"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import clsx from "@/lib/clsx";
import CalendarIcon from "./calendar-icon";
import ContactsIcon from "./contacts-icon";
import EmailIcon from "./email-icon";
import SmsIcon from "./sms-icon";
import ProjectsIcon from "./projects-icon";
import DashboardIcon from "./dashboard-icon";
import TasksIcon from "./tasks-icon";
import InvoicesIcon from "./invoices-icon";
import MarketingIcon from "./marketing-icon";
import SocialIcon from "./social-icon";
import BookingsIcon from "./bookings-icon";
import PersonalIcon from "./personal-icon";
import SettingsIcon from "./settings-icon";

// Keyed by href so the icon follows the route regardless of the (localized)
// label text. Every nav item gets the same colored-pill badge style used on
// its own Summary card/page header (Email, Calendar, Contacts, Projects) or
// a fitting new identity color otherwise (see each *-icon.tsx file).
const NAV_PILL_ICONS: Record<
  string,
  ComponentType<{ size?: string; iconSize?: string; className?: string }>
> = {
  "/": DashboardIcon,
  "/email": EmailIcon,
  "/sms": SmsIcon,
  "/calendar-app": CalendarIcon,
  "/tasks": TasksIcon,
  "/contacts": ContactsIcon,
  "/projects": ProjectsIcon,
  "/invoices": InvoicesIcon,
  "/marketing": MarketingIcon,
  "/social-analytics": SocialIcon,
  "/bookings": BookingsIcon,
  "/personal": PersonalIcon,
  "/settings": SettingsIcon,
};

export default function NavLink({
  href,
  label,
  collapsed = false,
  badge = 0,
}: {
  href: string;
  label: string;
  collapsed?: boolean;
  // Unread count shown as a small red circle (a dot on the icon when the
  // sidebar is collapsed).
  badge?: number;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  const PillIcon = NAV_PILL_ICONS[href];

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
        collapsed ? "justify-center px-0 py-0.5" : "px-3 py-0.5",
        active
          ? "bg-gradient-to-r from-amo-lime/20 to-amo-teal/10 text-amo-white shadow-[inset_2px_0_0_0_var(--amo-lime)]"
          : "text-amo-muted hover:bg-white/5 hover:text-amo-white"
      )}
    >
      <span className="relative shrink-0">
        {PillIcon && <PillIcon size="h-7 w-7" iconSize="h-4 w-4" />}
        {collapsed && badge > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-amo-green" />}
      </span>
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">{badge > 99 ? "99+" : badge}</span>
      )}
    </Link>
  );
}
