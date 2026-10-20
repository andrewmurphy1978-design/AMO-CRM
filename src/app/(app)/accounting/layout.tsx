import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getHour12 } from "@/lib/time-format";
import PageHeader from "../page-header";
import AccountingIcon from "../accounting-icon";
import AccountingNav from "./accounting-nav";

// Accounting is admin-only: it holds personal bank data.
export default async function AccountingLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");
  const lang = await getLang();
  const t = getDict(lang);
  const { hour12, toCategorize } = await withScopedPrismaClient(async (db) => ({
    hour12: await getHour12(session, db),
    toCategorize: await db.accTransaction.count({ where: { status: { in: ["NEW", "SUGGESTED"] } } }),
  }));
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <AccountingIcon />
            <span className="truncate">{t.nav.accounting}</span>
          </span>
        }
        hour12={hour12}
        lang={lang}
        location={t.dashboard.myLocation}
      />
      <AccountingNav lang={lang} toCategorize={toCategorize} />
      {children}
    </div>
  );
}
