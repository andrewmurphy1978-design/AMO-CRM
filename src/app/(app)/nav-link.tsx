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
        "block rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
        active
          ? "bg-gradient-to-r from-amo-lime/20 to-amo-teal/10 text-amo-white shadow-[inset_2px_0_0_0_var(--amo-lime)]"
          : "text-amo-muted hover:bg-white/5 hover:text-amo-white"
      )}
    >
      {label}
    </Link>
  );
}
