"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "@/lib/clsx";

export default function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={clsx(
        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      )}
    >
      {label}
    </Link>
  );
}
