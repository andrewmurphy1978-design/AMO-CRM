"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The Accounting section's own tabs (Overview, Transactions, Import, Reports, Journal, Setup).
export default function AccountingNav({ lang, toCategorize }: { lang: "en" | "fr"; toCategorize?: number }) {
  const pathname = usePathname();
  const fr = lang === "fr";
  const tabs = [
    { href: "/accounting", label: fr ? "Aperçu" : "Overview", exact: true },
    { href: "/accounting/transactions", label: fr ? "Transactions" : "Transactions", badge: toCategorize },
    { href: "/accounting/import", label: fr ? "Importer" : "Import" },
    { href: "/accounting/reconcile", label: fr ? "Rapprochement" : "Reconcile" },
    { href: "/accounting/reports", label: fr ? "Rapports" : "Reports" },
    { href: "/accounting/journal", label: fr ? "Journal" : "Journal" },
    { href: "/accounting/setup", label: fr ? "Configuration" : "Setup" },
  ];
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-card-border pb-px" aria-label="Accounting">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            className={
              active
                ? "btn-primary flex shrink-0 items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-semibold shadow-sm"
                : "flex shrink-0 items-center gap-2 rounded-t-lg border border-b-0 border-transparent px-4 py-2 text-sm font-medium text-soft hover:text-ink"
            }
          >
            {t.label}
            {t.badge ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
