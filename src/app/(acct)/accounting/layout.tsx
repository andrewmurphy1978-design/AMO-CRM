import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { accountingUserFor } from "@/lib/accounting/access";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getHour12 } from "@/lib/time-format";
import PageHeader from "@/app/(app)/page-header";
import AccountingIcon from "@/app/(app)/accounting-icon";
import AccountingNav from "./accounting-nav";

// Accounting holds personal bank data: admins and the team members given access, each with their own books.
export default async function AccountingLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const { hour12, toCategorize, me } = await withScopedPrismaClient(async (db) => {
    const me = await accountingUserFor(db, session);
    // Keeps every entity's chart up to date (new template accounts, moved accounts) before any page or action uses it.
    if (me) await ensureAccountingSetup(db, me);
    return {
      me,
      hour12: await getHour12(session, db),
      toCategorize: me ? await db.accTransaction.count({ where: { status: { in: ["NEW", "SUGGESTED"] }, account: { entity: { ownerId: me.id } } } }) : 0,
    };
  });
  if (!me) redirect("/");
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
