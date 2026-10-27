"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// Makes a whole detail card open `href` on click, except where the click lands on a button, link or scrollable list.
export default function CardLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <div
      className={`${className} cursor-pointer`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
        router.push(href);
      }}
    >
      {children}
    </div>
  );
}
