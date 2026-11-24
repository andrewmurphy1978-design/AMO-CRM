import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { isPersonalSectionUser } from "@/lib/personal-watch";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import PageHeader from "../page-header";
import AiMembershipsIcon from "../ai-memberships-icon";
import AiMembershipsList, { AddMembershipButton, type MembershipRow } from "./ai-memberships-list";

export default async function AiMembershipsPage() {
  const session = await auth();
  if (!session || !isPersonalSectionUser(session.user.email)) {
    redirect("/");
  }

  const lang = await getLang();
  const t = getDict(lang);

  // One shared client — see src/lib/prisma.ts for why (each `prisma.x`
  // property access on the raw proxy opens a brand-new connection).
  const { hour12, memberships, affiliatePrograms } = await withScopedPrismaClient(async (db) => {
    const hour12 = await getHour12(session, db);
    // Sort by usage first — the enum is declared DAILY, WEEKLY, MONTHLY,
    // RARELY, and Postgres orders an enum column by that declaration order,
    // so an ascending sort here is exactly "most used on top" with no extra
    // numeric rank field needed.
    const memberships = await db.aiMembership.findMany({ orderBy: [{ usage: "asc" }, { name: "asc" }] });
    // AffiliateProgram's own AI_TOOLS tab tracks programs Andrew promotes as
    // an affiliate, which often overlaps with tools he actually has a paid
    // account with (its "accountPlan" field) — matched by name below rather
    // than a stored foreign key, since a membership can exist with no
    // matching affiliate program yet, or vice versa.
    const affiliatePrograms = await db.affiliateProgram.findMany({
      where: { tab: "AI_TOOLS" },
      select: { id: true, name: true, accountPlan: true },
    });
    return { hour12, memberships, affiliatePrograms };
  });

  // "Today" as a calendar date in Andrew's own timezone, then pinned to UTC
  // midnight — matches the UTC-midnight Date Prisma hands back for a
  // Postgres DATE column, so the day-count subtraction below isn't thrown
  // off by the few hours UTC and America/Montreal disagree on which
  // calendar day it currently is.
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montreal", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayUtcMidnight = new Date(`${todayYmd}T00:00:00Z`);

  const programsByName = new Map(affiliatePrograms.map((p) => [p.name.trim().toLowerCase(), p]));

  const rows: MembershipRow[] = memberships.map((m) => {
    const match = programsByName.get(m.name.trim().toLowerCase());
    const daysRemaining = m.renewsAt ? Math.round((m.renewsAt.getTime() - todayUtcMidnight.getTime()) / 86400000) : null;
    return {
      id: m.id,
      name: m.name,
      plan: m.plan,
      isFree: m.isFree,
      costUsdMonthly: m.costUsdMonthly,
      costCadMonthly: m.costCadMonthly,
      creditsAvailable: m.creditsAvailable,
      creditsPerMonth: m.creditsPerMonth,
      rolloverCredits: m.rolloverCredits,
      renewsAt: m.renewsAt ? m.renewsAt.toISOString().slice(0, 10) : null,
      daysRemaining,
      usage: m.usage,
      notes: m.notes,
      account: match ? { programId: match.id, accountPlan: match.accountPlan } : null,
    };
  });

  const totalUsd = memberships.reduce((sum, m) => sum + (m.costUsdMonthly ?? 0), 0);
  const totalCad = memberships.reduce((sum, m) => sum + (m.costCadMonthly ?? 0), 0);

  return (
    <div className="flex flex-col gap-2 sm:gap-6">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <AiMembershipsIcon />
            <span className="truncate">{t.aiMemberships.title}</span>
          </span>
        }
        hour12={hour12}
        lang={lang}
        location={t.dashboard.myLocation}
        actions={<AddMembershipButton lang={lang} />}
      />

      <AiMembershipsList rows={rows} totalUsd={totalUsd} totalCad={totalCad} lang={lang} />
    </div>
  );
}
