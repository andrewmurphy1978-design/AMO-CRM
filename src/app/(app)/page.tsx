import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import {
  formatDistanceToNow,
  format,
  startOfWeek,
  addDays,
  type Locale,
} from "date-fns";
import {
  isTodayInZone,
  isYesterdayInZone,
  isTomorrowInZone,
  startOfTodayInZone,
} from "@/lib/user-timezone";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "./page-header";
import CardSkeleton from "./card-skeleton";
import WeatherHeaderServer from "./weather-header-server";
import { WeatherWidgetSkeleton } from "./header-weather-widget";
import HeaderWorldClockWidget from "./header-world-clock-widget";
import NewsHeaderServer from "./news-header-server";
import { NewsWidgetSkeleton } from "./header-news-widget";
import SportsHeaderServer from "./sports-header-server";
import { SportsWidgetSkeleton } from "./header-sports-widget";
import MarketsHeaderServer from "./markets-header-server";
import { MarketsWidgetSkeleton } from "./header-markets-widget";
import EmailCard from "./email-card";
import EmailSummaryCard from "./email-summary-card";
import CalendarCardServer from "./calendar-card-server";
import CalendarSummaryCard from "./calendar-summary-card";
import NewContactsCard from "./new-contacts-card";
import ContactSummaryCard from "./contact-summary-card";
import ProjectSummaryCard from "./project-summary-card";
import AffiliateProgramsSummaryCard, {
  type AffiliateProgramsSummaryCounts,
} from "./affiliate-programs-summary-card";
import AutomationsSummaryCard, {
  type AutomationsSummaryCounts,
} from "./automations-summary-card";
import PendingAffiliateProgramsCard, {
  type PendingAffiliateProgramRow,
} from "./pending-affiliate-programs-card";
import { dashboardBucketOf } from "@/lib/affiliate-status";
import ProjectsIcon from "./projects-icon";
import TasksIcon from "./tasks-icon";
import { PROJECT_CARD_ACCENT_BAR, PROJECT_CARD_BG } from "./project-summary-colors";
import { TASK_CARD_ACCENT_BAR, TASK_CARD_BG } from "./task-card-colors";
import {
  getCachedInbox,
  getScreeningExtras,
  refreshEmailInboxCache,
  type EmailScreeningPayload,
} from "@/lib/email-inbox";
import { isStale } from "@/lib/staleness";
import SocialCard from "./social-card";
import SocialAnalyticsSummaryCard from "./social-summary-card";
import {
  getValidAccessToken,
  getCalendarEventsInRange,
  getRecentlyCreatedEvents,
  type CalendarEventSummary,
} from "@/lib/google";
import { getLatestSocialSnapshots, summarizeSocialSnapshots } from "@/lib/social";
import { refreshMakeRunsQuietly } from "@/lib/automations";
import { getHour12 } from "@/lib/time-format";
import { getUserWorldClockZones } from "@/lib/world-clock-zones";
import { getUserMarketsPicks } from "@/lib/dashboard-markets-picks";
import { getUserSportsPicks } from "@/lib/dashboard-sports-picks";
import { getUserHiddenHeaderWidgets } from "@/lib/dashboard-header-widgets";
import type { AutomationRun } from "@prisma/client";

// Same full lockup used in the sidebar's expanded state elsewhere — the
// Dashboard's own sidebar entry hides it (see Sidebar's hideLogo prop) and
// shows it here in the header instead.
const AMO_LOGO_URL =
  "https://d1yei2z3i6k35z.cloudfront.net/18410699/6a596ef4e08523.10636812_AMOBadgeTransparentwithAMOonly.png";

// "about 8 hours ago" is vague for something you'd want to check against a
// posting schedule — this gives "Today at 3:15 PM" / "Yesterday at 9:00 AM" /
// "Sep 12 at 9:00 AM" instead.
function formatSmartDateTime(
  date: Date,
  dateLocale: Locale | undefined,
  t: ReturnType<typeof getDict>,
): string {
  const time = format(date, "p", { locale: dateLocale });
  if (isTodayInZone(date)) return t.dashboard.todayAt(time);
  if (isYesterdayInZone(date)) return t.dashboard.yesterdayAt(time);
  return t.dashboard.dateAt(
    format(date, "MMM d", { locale: dateLocale }),
    time,
  );
}

type AutomationEntry =
  | { kind: "run"; run: AutomationRun }
  | {
      kind: "successGroup";
      source: string;
      name: string | null;
      count: number;
      latest: Date;
    };

// Make's execution history can't tell us which specific post/platform ran
// (the scenario doesn't log that anywhere once a queue item is processed —
// see chat), so every successful run currently looks identical: the same
// scenario name over and over. Rather than list "Social Media Poster —
// Success" a dozen times, consecutive successful runs of the same
// automation collapse into one line; failures always stay individual since
// each one is actually worth looking at.
function groupAutomationRuns(runs: AutomationRun[]): AutomationEntry[] {
  const entries: AutomationEntry[] = [];
  for (const run of runs) {
    if (run.status === "error") {
      entries.push({ kind: "run", run });
      continue;
    }
    const last = entries[entries.length - 1];
    if (
      last?.kind === "successGroup" &&
      last.source === run.source &&
      last.name === run.name
    ) {
      last.count += 1;
      if (run.occurredAt > last.latest) last.latest = run.occurredAt;
      continue;
    }
    entries.push({
      kind: "successGroup",
      source: run.source,
      name: run.name,
      count: 1,
      latest: run.occurredAt,
    });
  }
  return entries;
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

// Same shape as the Email/Calendar pages' own local copies of this — feeds
// the Email card's "Linked to" contact picker.
function contactLabel(c: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email || "";
}

export default async function DashboardPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  const sevenDaysAgo = daysFromNow(-7);
  const sevenDaysFromNow = daysFromNow(7);
  const todayStart = startOfTodayInZone();

  // One shared client for every dashboard read below (counts, lists,
  // Google's token, the social snapshots loop, the user's time format) —
  // the `prisma` proxy in src/lib/prisma.ts opens a brand-new client (and,
  // under Cloudflare Workers, a brand-new pooled connection) on every
  // single property access, so calling it 20+ times in one page render
  // piles up enough fresh-connection overhead in one Worker invocation to
  // trip Cloudflare's Error 1102 resource-limit page. withScopedPrismaClient
  // builds exactly one client and reuses it for the whole render instead —
  // same fix already used for the systeme.io/Buffer/Make bulk syncs.
  const {
    activeProjectCount,
    activePhaseCount,
    activeTaskCount,
    deadlineTasksList,
    dueSoonTasks,
    activeProjects,
    newContactsList,
    totalContactCount,
    contactsBySource,
    contactsByStage,
    integration,
    recentRuns,
    googleAccessToken,
    socialSnapshots,
    hour12,
    worldZones,
    headerZones,
    headerZoneMobile,
    marketsCurrency,
    marketsItems,
    marketsItemMobile,
    sportsLeague,
    sportsTeamNhl,
    sportsTeamMlb,
    sportsLeagueMobile,
    hiddenHeaderWidgets,
    emailInitialData,
    addressColors,
    linkContacts,
    linkProjects,
    linkTasks,
    linkAffiliatePrograms,
    allAffiliatePrograms,
  } = await withScopedPrismaClient(async (db) => {
    const activeProjectCount = await db.project.count({
      where: { status: "ACTIVE" },
    });
    // Feeds the Project Summary card. Same status set the removed Open-
    // Tasks stat used for "active" — TODO/IN_PROGRESS/BLOCKED, everything
    // short of DONE.
    const activePhaseCount = await db.projectPhase.count({
      where: { status: "ACTIVE" },
    });
    const activeTaskCount = await db.task.count({
      where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
    });
    // Today/tomorrow/this-week deadline buckets (computed below, once
    // we're back on plain JS Dates) — every non-done task due in the next
    // 7 days, not just the ones the "Upcoming tasks" list below happens to
    // show.
    const deadlineTasksList = await db.task.findMany({
      where: {
        status: { not: "DONE" },
        dueDate: { gte: todayStart, lte: sevenDaysFromNow },
      },
      select: { id: true, dueDate: true },
    });
    const dueSoonTasks = await db.task.findMany({
      where: {
        status: { in: ["TODO", "IN_PROGRESS"] },
        dueDate: { not: null },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { project: { include: { contact: true } } },
    });
    const activeProjects = await db.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { updatedAt: "desc" },
      ],
      take: 5,
      include: { contact: true },
    });
    // Feeds the new-contacts Dashboard card (today/yesterday/this week
    // buckets computed below, once we're back on plain JS Dates) — every
    // matching row, not just the card's own visible 2/2/5 rows-before-
    // scroll, since the card's own scrollbar (not this query) is what
    // limits what's actually on screen. The 1000 cap is just a sanity
    // ceiling, not a real-world limit.
    const newContactsList = await db.contact.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: { tags: { include: { tag: true } } },
    });
    // Feeds the Contact Summary card's total/by-source/by-stage counts —
    // groupBy rather than fetching every row, since the total contact
    // count can run well past newContactsList's 1000-row cap.
    const totalContactCount = await db.contact.count();
    const contactsBySource = await db.contact.groupBy({
      by: ["source"],
      _count: { _all: true },
    });
    const contactsByStage = await db.contact.groupBy({
      by: ["stage"],
      _count: { _all: true },
    });
    const integration = await db.integrationSetting.findUnique({
      where: { provider: "systeme_io" },
    });
    // Zapier runs arrive live via its own webhook, but Make only reports
    // in when pulled — refreshing here keeps the Automations card current
    // on every Dashboard load without the user having to visit Settings
    // and click "Sync now" first. Reuses this same `db` rather than
    // calling runMakeSync() (which opens its own scoped client) — see
    // refreshMakeRunsQuietly's own comment.
    await refreshMakeRunsQuietly(db);
    const recentRuns = await db.automationRun.findMany({
      orderBy: { occurredAt: "desc" },
      take: 30,
    });
    const googleAccessToken = session
      ? await getValidAccessToken(session.user.id, db)
      : null;
    const socialSnapshots = await getLatestSocialSnapshots(db);
    const hour12 = await getHour12(session, db);
    const { worldZones, headerZones, headerZoneMobile } = await getUserWorldClockZones(session, db);
    const { currency: marketsCurrency, items: marketsItems, itemMobile: marketsItemMobile } = await getUserMarketsPicks(session, db);
    const {
      league: sportsLeague,
      teamNhl: sportsTeamNhl,
      teamMlb: sportsTeamMlb,
      leagueMobile: sportsLeagueMobile,
    } = await getUserSportsPicks(session, db);
    const hiddenHeaderWidgets = await getUserHiddenHeaderWidgets(session, db);
    // Same address-color lookup the Email page's own dialogs use for their
    // colored header strip — fetched here too now that this card opens
    // those same dialogs instead of deep-linking out to Gmail.
    const addressColors = await db.emailAddressColor.findMany({
      orderBy: { order: "asc" },
    });
    // Same full option lists (not the filtered/limited ones above) the
    // Email page's own "Linked to" contact/project/task/program picker
    // uses — this card opens the identical dialog, so it needs the same
    // full lists to offer, not the Dashboard's own top-5/last-7-days ones.
    const linkContacts = await db.contact.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 300,
      select: { id: true, firstName: true, lastName: true, email: true, extraEmails: true },
    });
    const linkProjects = await db.project.findMany({
      orderBy: { name: "asc" },
      take: 300,
      select: { id: true, name: true, contactId: true },
    });
    const linkTasks = await db.task.findMany({
      where: { status: { not: "DONE" } },
      orderBy: { title: "asc" },
      take: 300,
      select: { id: true, title: true, projectId: true },
    });
    const linkAffiliatePrograms = await db.affiliateProgram.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, extraEmails: true },
    });
    // Feeds the Affiliate Programs Summary card's 4-bucket breakdown and the
    // Pending Affiliate Programs list card below — every program, since the
    // summary card's totals must reflect all of them, not just the pending
    // ones the list card shows.
    const allAffiliatePrograms = await db.affiliateProgram.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        tab: true,
        name: true,
        type: true,
        iconUrl: true,
        affiliateStatus: true,
        followUpNeeded: true,
        followUpDate: true,
      },
    });

    // Reads the same cached inbox snapshot the Email page maintains — a
    // plain DB read shares this block's one connection instead of the
    // email card doing its own scoped read from inside a concurrently-
    // rendered Suspense boundary (which is exactly the pattern that trips
    // Cloudflare's Error 1102: two Suspense children each opening their
    // own connection at once). But a snapshot that's gone stale (cron
    // hiccup, or mail simply arriving faster than the 15-minute cron/
    // client refresh cadence) is exactly what made the Email Summary
    // card's "new emails today" count read low — that count is computed
    // once here, server-side, and unlike the Email card below it never
    // gets a chance to self-correct via a client-side refresh. Refreshing
    // here when stale, on the same window the Email page's own client
    // check already uses (src/lib/staleness.ts), means the very first
    // paint is already correct, and it also means the Email card's own
    // "is my initialData stale?" check below finds nothing to do.
    const emailInitialData: EmailScreeningPayload | null =
      googleAccessToken && session
        ? await (async () => {
            const cached = await getCachedInbox(db, session.user.id);
            let snapshot = cached;
            if (!cached || isStale(cached.fetchedAt)) {
              try {
                snapshot = await refreshEmailInboxCache(
                  db,
                  session.user.id,
                  googleAccessToken,
                );
              } catch {
                // A transient Gmail/IONOS hiccup should never take down
                // the whole Dashboard — fall back to the last known
                // snapshot (possibly still null on a genuine first-ever
                // visit, same as before this refresh existed).
                snapshot = cached;
              }
            }
            if (!snapshot) return null;
            const extras = await getScreeningExtras(
              db,
              snapshot,
              session.user.id,
            );
            return { ...snapshot, ...extras };
          })()
        : null;

    return {
      activeProjectCount,
      activePhaseCount,
      activeTaskCount,
      deadlineTasksList,
      dueSoonTasks,
      activeProjects,
      newContactsList,
      totalContactCount,
      contactsBySource,
      contactsByStage,
      integration,
      recentRuns,
      googleAccessToken,
      socialSnapshots,
      hour12,
      worldZones,
      headerZones,
      headerZoneMobile,
      marketsCurrency,
      marketsItems,
      marketsItemMobile,
      sportsLeague,
      sportsTeamNhl,
      sportsTeamMlb,
      sportsLeagueMobile,
      hiddenHeaderWidgets,
      emailInitialData,
      addressColors,
      linkContacts,
      linkProjects,
      linkTasks,
      linkAffiliatePrograms,
      allAffiliatePrograms,
    };
  });
  const automationEntries = groupAutomationRuns(recentRuns).slice(0, 8);
  const automationSummaryCounts: AutomationsSummaryCounts = {
    total: recentRuns.length,
    success: recentRuns.filter((r) => r.status !== "error").length,
    failed: recentRuns.filter((r) => r.status === "error").length,
    make: recentRuns.filter((r) => r.source === "make").length,
    zapier: recentRuns.filter((r) => r.source === "zapier").length,
  };

  // Bucket counts for the Affiliate Programs Summary card, and the pending-
  // only subset for the Pending Affiliate Programs list card just below it.
  const affiliateBucketCounts = { active: 0, pending: 0, declinedBlocked: 0, noProgram: 0 };
  const pendingAffiliatePrograms: PendingAffiliateProgramRow[] = [];
  for (const program of allAffiliatePrograms) {
    const bucket = dashboardBucketOf(program.affiliateStatus);
    if (bucket === "ACTIVE") affiliateBucketCounts.active++;
    else if (bucket === "PENDING") {
      affiliateBucketCounts.pending++;
      pendingAffiliatePrograms.push(program);
    } else if (bucket === "DECLINED_BLOCKED") affiliateBucketCounts.declinedBlocked++;
    else affiliateBucketCounts.noProgram++;
  }
  const affiliateSummaryCounts: AffiliateProgramsSummaryCounts = {
    total: allAffiliatePrograms.length,
    active: affiliateBucketCounts.active,
    pending: affiliateBucketCounts.pending,
    declinedBlocked: affiliateBucketCounts.declinedBlocked,
    noProgram: affiliateBucketCounts.noProgram,
  };
  const socialSummaryCounts = summarizeSocialSnapshots(socialSnapshots);

  // Feeds the Email card's "Linked to" picker — same option shapes the
  // Email page itself builds from the equivalent full-list queries above.
  const emailLinkContactOptions = linkContacts.map((c) => ({
    id: c.id,
    label: contactLabel(c),
    email: c.email,
    extraEmails: c.extraEmails,
  }));
  const emailLinkProjectOptions = linkProjects.map((p) => ({
    id: p.id,
    label: p.name,
    contactId: p.contactId,
  }));
  const emailLinkTaskOptions = linkTasks.map((tk) => ({
    id: tk.id,
    label: tk.title,
    projectId: tk.projectId,
  }));
  const emailLinkProgramOptions = linkAffiliatePrograms.map((p) => ({
    id: p.id,
    label: p.name,
    email: p.email,
    extraEmails: p.extraEmails,
  }));

  // Feeds the Email Summary stat card — same classification/completion/
  // read-state rules the Email card itself applies to its NEEDS_ATTENTION/
  // CAN_WAIT sections, just counted instead of rendered. Drafts aren't
  // included here since (like the Email card) they're only ever available
  // via a live client-side fetch — the Summary card fetches its own count.
  const emailToday = (emailInitialData?.emails ?? []).filter((e) =>
    isTodayInZone(new Date(e.date)),
  ).length;
  const emailNeedsAttention = (emailInitialData?.emails ?? []).filter(
    (e) =>
      !emailInitialData?.completions[e.id] &&
      !emailInitialData?.readStates[e.id] &&
      emailInitialData?.classifications[e.id] === "NEEDS_ATTENTION",
  ).length;
  const emailCanWait = (emailInitialData?.emails ?? []).filter(
    (e) =>
      !emailInitialData?.completions[e.id] &&
      !emailInitialData?.readStates[e.id] &&
      emailInitialData?.classifications[e.id] === "CAN_WAIT",
  ).length;
  const emailAwaitingReply = (emailInitialData?.sentAwaitingReply ?? []).filter(
    (s) => s.status === "awaiting" && !emailInitialData?.completions[s.id],
  ).length;

  // Same 3 buckets the card's own sections are keyed by — computed here
  // (not inside the DB callback) since isTodayInZone/isYesterdayInZone just
  // need plain JS Dates, not another query.
  const newContactsToday = newContactsList.filter((c) => isTodayInZone(c.createdAt));
  const newContactsYesterday = newContactsList.filter((c) =>
    isYesterdayInZone(c.createdAt),
  );
  const newContactsThisWeek = newContactsList.filter(
    (c) => !isTodayInZone(c.createdAt) && !isYesterdayInZone(c.createdAt),
  );
  const newContactsLabels = {
    title: t.dashboard.newContactsTitle,
    today: t.dashboard.newContactsToday,
    yesterday: t.dashboard.newContactsYesterday,
    thisWeek: t.dashboard.newContactsThisWeek,
    noneYet: t.dashboard.newContactsNoneYet,
  };

  // Feeds the Contact Summary stat card. bySource only breaks out the two
  // sources worth distinguishing at a glance (systeme.io sync vs. a
  // Google Contacts import) — manual entries and anything else still
  // count toward `total` above, just aren't shown split out here.
  let contactsBySourceSystemeIo = 0;
  let contactsBySourceGoogle = 0;
  for (const group of contactsBySource) {
    const count = group._count._all;
    if (group.source === "systeme.io") contactsBySourceSystemeIo += count;
    else if (group.source === "google_contacts") contactsBySourceGoogle += count;
  }
  // The 6 ContactStage values collapse into 2 groups for this card: still
  // in the sales pipeline (Lead/Prospect/Client) vs. no longer active
  // (Past client/Unsubscribed/Personal).
  const ACTIVE_STAGES = new Set(["LEAD", "PROSPECT", "CLIENT"]);
  let activeStageCount = 0;
  let inactiveStageCount = 0;
  for (const group of contactsByStage) {
    if (ACTIVE_STAGES.has(group.stage)) activeStageCount += group._count._all;
    else inactiveStageCount += group._count._all;
  }
  const contactSummaryLabels = {
    title: t.dashboard.contactSummaryTitle,
    totalLabel: t.dashboard.contactSummaryTotalLabel,
    todayLabel: t.dashboard.newContactsToday,
    yesterdayLabel: t.dashboard.newContactsYesterday,
    thisWeekLabel: t.dashboard.newContactsThisWeek,
    sourceSystemeIoLabel: t.dashboard.contactSummarySourceSystemeIoLabel,
    sourceGoogleLabel: t.dashboard.contactSummarySourceGoogleLabel,
    activeStageLabel: t.dashboard.contactSummaryActiveStageLabel,
    inactiveStageLabel: t.dashboard.contactSummaryInactiveStageLabel,
  };
  const contactSummaryCounts = {
    total: totalContactCount,
    today: newContactsToday.length,
    yesterday: newContactsYesterday.length,
    thisWeek: newContactsThisWeek.length,
    bySource: {
      systemeIo: contactsBySourceSystemeIo,
      google: contactsBySourceGoogle,
    },
    activeStageCount,
    inactiveStageCount,
  };

  // Feeds the Project Summary stat card's deadline composite — same
  // today/isTomorrowInZone/catch-all bucketing style as the Contact
  // Summary card's own Today/Yesterday/This-week buckets above, just
  // forward-looking (a task due later today still counts as "today" even
  // if dueDate's clock time has already passed, which is why the query
  // above starts the window at todayStart rather than "now").
  const tasksDueToday = deadlineTasksList.filter(
    (task) => task.dueDate && isTodayInZone(task.dueDate),
  );
  const tasksDueTomorrow = deadlineTasksList.filter(
    (task) => task.dueDate && isTomorrowInZone(task.dueDate),
  );
  const tasksDueThisWeek = deadlineTasksList.filter(
    (task) =>
      task.dueDate &&
      !isTodayInZone(task.dueDate) &&
      !isTomorrowInZone(task.dueDate),
  );
  const projectSummaryLabels = {
    title: t.dashboard.projectSummaryTitle,
    activeProjectsLabel: t.dashboard.projectSummaryActiveProjectsLabel,
    activePhasesLabel: t.dashboard.projectSummaryActivePhasesLabel,
    activeTasksLabel: t.dashboard.projectSummaryActiveTasksLabel,
    todayLabel: t.dashboard.calendarToday,
    tomorrowLabel: t.dashboard.calendarTomorrow,
    thisWeekLabel: t.dashboard.newContactsThisWeek,
  };
  const projectSummaryCounts = {
    activeProjects: activeProjectCount,
    activePhases: activePhaseCount,
    activeTasks: activeTaskCount,
    today: tasksDueToday.length,
    tomorrow: tasksDueTomorrow.length,
    thisWeek: tasksDueThisWeek.length,
  };
  const affiliateSummaryLabels = {
    title: t.dashboard.affiliateSummaryTitle,
    totalLabel: t.dashboard.affiliateSummaryTotalLabel,
    activeLabel: t.dashboard.affiliateSummaryActiveLabel,
    pendingLabel: t.dashboard.affiliateSummaryPendingLabel,
    declinedBlockedLabel: t.dashboard.affiliateSummaryDeclinedBlockedLabel,
    noProgramLabel: t.dashboard.affiliateSummaryNoProgramLabel,
  };
  const pendingAffiliateProgramsLabels = {
    title: t.dashboard.pendingAffiliateProgramsTitle,
    noneYet: t.dashboard.noPendingAffiliatePrograms,
  };

  const weatherLabels = {
    title: t.dashboard.weatherTitle,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
    updatedPrefix: t.dashboard.updatedPrefix,
    humidity: t.dashboard.weatherHumidity,
    wind: t.dashboard.weatherWind,
    high: t.dashboard.weatherHigh,
    low: t.dashboard.weatherLow,
    feelsLike: t.dashboard.weatherFeelsLike,
    unavailable: t.dashboard.weatherUnavailable,
  };
  const newsLabels = {
    title: t.dashboard.newsTitle,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
    unavailable: t.dashboard.newsUnavailable,
    categories: {
      local: t.dashboard.newsCategoryLocal,
      montreal: t.dashboard.newsCategoryMontreal,
      quebec: t.dashboard.newsCategoryQuebec,
      canada: t.dashboard.newsCategoryCanada,
      us: t.dashboard.newsCategoryUs,
      europe: t.dashboard.newsCategoryEurope,
      world: t.dashboard.newsCategoryWorld,
    },
  };
  const marketsLabels = {
    title: t.dashboard.marketsTitle,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
    unavailable: t.dashboard.marketsUnavailable,
    currencies: t.dashboard.marketsCurrencies,
    indices: t.dashboard.marketsIndices,
    commodities: t.dashboard.marketsCommodities,
    crypto: t.dashboard.marketsCrypto,
  };
  const sportsUnavailableLabel = t.dashboard.sportsUnavailable;
  const sportsLabels = {
    title: t.dashboard.sportsTitle,
    unavailable: t.dashboard.sportsUnavailable,
    lastGame: t.dashboard.sportsLastGame,
    nextGame: t.dashboard.sportsNextGame,
    final: t.dashboard.sportsFinal,
    vs: t.dashboard.sportsVs,
    at: t.dashboard.sportsAt,
    series: t.dashboard.sportsSeries,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
  };

  const emailLabels = {
    title: t.dashboard.emailTitle,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
    screening: t.dashboard.emailScreening,
    notConnected: t.dashboard.emailNotConnected,
    connectInSettings: t.dashboard.emailConnectInSettings,
    noItems: t.dashboard.emailNoItems,
    categoryNeedsReply: t.email.categoryNeedsReply,
    categoryNeedsAttention: t.email.categoryNeedsAttention,
    awaitingResponse: t.dashboard.emailAwaitingResponse,
  };
  const emailSummaryLabels = {
    title: t.dashboard.emailSummaryTitle,
    todayLabel: t.dashboard.emailSummaryTodayLabel,
    draftsLabel: t.dashboard.emailSummaryDraftsLabel,
    awaitingReplyLabel: t.dashboard.emailSummaryAwaitingReplyLabel,
    needsAttentionLabel: t.dashboard.emailSummaryNeedsAttentionLabel,
    canWaitLabel: t.dashboard.emailSummaryCanWaitLabel,
  };
  const emailSummaryCounts = {
    today: emailToday,
    awaitingReply: emailAwaitingReply,
    needsAttention: emailNeedsAttention,
    canWait: emailCanWait,
  };

  // Feeds the Calendar Summary stat card — a separate, explicit
  // [this week, next week) range fetch rather than reusing the Dashboard
  // Calendar card's own "today+15 days" query (getUpcomingEvents), so this
  // card's counts always mean the same thing regardless of what the other
  // card happens to have loaded.
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const thisWeekEnd = addDays(thisWeekStart, 7);
  const nextWeekEnd = addDays(thisWeekStart, 14);
  const calendarSummaryEvents: CalendarEventSummary[] = googleAccessToken
    ? ((await getCalendarEventsInRange(
        googleAccessToken,
        thisWeekStart.toISOString(),
        nextWeekEnd.toISOString(),
      )) ?? [])
    : [];

  function eventBucketDate(e: CalendarEventSummary): Date | null {
    const iso = e.start ?? e.end;
    return iso ? new Date(iso) : null;
  }
  const thisWeekEvents = calendarSummaryEvents.filter((e) => {
    const d = eventBucketDate(e);
    return d !== null && d >= thisWeekStart && d < thisWeekEnd;
  });
  const nextWeekEventCount = calendarSummaryEvents.filter((e) => {
    const d = eventBucketDate(e);
    return d !== null && d >= thisWeekEnd && d < nextWeekEnd;
  }).length;

  // Total duration of a set of events, in hours — feeds the "count + Xh"
  // display each metric sub-card (other than the family one) shows beside
  // its number. All-day events and any event missing a start/end have no
  // meaningful duration, so they're skipped rather than counted as 0h.
  function sumEventHours(events: CalendarEventSummary[]): number {
    return events.reduce((sum, e) => {
      if (e.allDay || !e.start || !e.end) return sum;
      const hours =
        (new Date(e.end).getTime() - new Date(e.start).getTime()) /
        (1000 * 60 * 60);
      return sum + hours;
    }, 0);
  }

  // Deliberately its own fetch (getRecentlyCreatedEvents), not a filter of
  // calendarSummaryEvents above — that fetch is bounded to [this week, next
  // week) for display reasons, so it would miss an event created recently
  // but scheduled further out (e.g. an appointment booked a month ahead).
  const last48Hours = hoursAgo(48);
  const recentlyCreatedEvents = googleAccessToken
    ? ((await getRecentlyCreatedEvents(
        googleAccessToken,
        last48Hours.toISOString(),
      )) ?? [])
    : [];
  const newEvents = recentlyCreatedEvents.filter(
    (e) => e.created && new Date(e.created) >= last48Hours,
  );

  // Andrew's own work shifts at Mike's — title match, explicitly excluding
  // anything that also mentions Haley/Zack (e.g. a shared family event)
  // since the count is meant to be Andrew's shifts only.
  const shiftEvents = thisWeekEvents.filter((e) => {
    const title = e.title.toLowerCase();
    const isShift = title.includes("mike's") || title.includes("mikes");
    const isShared = title.includes("haley") || title.includes("zack");
    return isShift && !isShared;
  });

  // Google Calendar's own colorId values (see GOOGLE_EVENT_COLORS in
  // src/lib/calendar-colors.ts) — Business/Children/Mommy are told apart
  // by the color the event itself was given in Google Calendar, not by
  // title keywords (only the Mike's-shifts match above still uses title
  // text, since it isn't tied to a color).
  const BASIL_COLOR_ID = "10";
  const BANANA_COLOR_ID = "5";
  const GRAPHITE_COLOR_ID = "8";

  const businessEvents = thisWeekEvents.filter(
    (e) => e.colorId === BASIL_COLOR_ID,
  );

  const bananaEvents = thisWeekEvents.filter(
    (e) => e.colorId === BANANA_COLOR_ID,
  );
  const haleyCount = bananaEvents.filter((e) =>
    e.title.toLowerCase().includes("haley"),
  ).length;
  const lukasCount = bananaEvents.filter((e) =>
    e.title.toLowerCase().includes("lukas"),
  ).length;
  const mommyEventCount = thisWeekEvents.filter(
    (e) => e.colorId === GRAPHITE_COLOR_ID,
  ).length;

  const calendarSummaryLabels = {
    title: t.dashboard.calendarSummaryTitle,
    thisWeekLabel: t.dashboard.calendarSummaryThisWeekLabel,
    nextWeekLabel: t.dashboard.calendarSummaryNextWeekLabel,
    newLabel: t.dashboard.calendarSummaryNewLabel,
    businessLabel: t.dashboard.calendarSummaryBusinessLabel,
    shiftsLabel: t.dashboard.calendarSummaryShiftsLabel,
    haleyLabel: t.dashboard.calendarSummaryHaleyLabel,
    lukasLabel: t.dashboard.calendarSummaryLukasLabel,
    mommyLabel: t.dashboard.calendarSummaryMommyLabel,
  };
  const calendarSummaryCounts = {
    thisWeek: thisWeekEvents.length,
    nextWeek: nextWeekEventCount,
    newEvents: newEvents.length,
    newHours: sumEventHours(newEvents),
    business: businessEvents.length,
    businessHours: sumEventHours(businessEvents),
    shifts: shiftEvents.length,
    shiftsHours: sumEventHours(shiftEvents),
    haley: haleyCount,
    lukas: lukasCount,
    mommy: mommyEventCount,
  };
  const socialLabels = {
    title: t.dashboard.socialTitle,
    empty: t.dashboard.socialEmpty,
    followers: t.dashboard.socialFollowers,
    engagement: t.dashboard.socialEngagement,
    views: t.dashboard.socialViews,
    languageEn: t.dashboard.socialLanguageEn,
    languageFr: t.dashboard.socialLanguageFr,
    updatedPrefix: t.dashboard.updatedPrefix,
    syncNow: t.automations.syncNow,
    syncing: t.automations.syncing,
    statLabels: {
      postCount: t.dashboard.socialStatPostCount,
      reactions: t.dashboard.socialStatReactions,
      comments: t.dashboard.socialStatComments,
      reach: t.dashboard.socialStatReach,
      impressions: t.dashboard.socialStatImpressions,
      likes: t.dashboard.socialStatLikes,
      shares: t.dashboard.socialStatShares,
      saves: t.dashboard.socialStatSaves,
    },
    platformNames: {
      facebook: t.dashboard.socialFacebook,
      instagram: t.dashboard.socialInstagram,
      linkedin: t.dashboard.socialLinkedin,
      youtube: t.dashboard.socialYoutube,
      tiktok: t.dashboard.socialTiktok,
      x: t.dashboard.socialX,
    },
  };
  const socialSummaryLabels = {
    title: t.dashboard.socialSummaryTitle,
    followersLabel: t.dashboard.socialSummaryFollowersLabel,
    growthLabel: t.dashboard.socialSummaryGrowthLabel,
    engagementLabel: t.dashboard.socialSummaryEngagementLabel,
    viewsLabel: t.dashboard.socialSummaryViewsLabel,
    platformsLabel: t.dashboard.socialSummaryPlatformsLabel,
  };
  const automationsSummaryLabels = {
    title: t.dashboard.automationsSummaryTitle,
    totalLabel: t.dashboard.automationsSummaryTotalLabel,
    successLabel: t.dashboard.automationsSummarySuccessLabel,
    failedLabel: t.dashboard.automationsSummaryFailedLabel,
    makeLabel: t.dashboard.automationsSummaryMakeLabel,
    zapierLabel: t.dashboard.automationsSummaryZapierLabel,
  };
  const calendarLabels = {
    title: t.dashboard.calendarTitle,
    refresh: t.dashboard.refresh,
    refreshing: t.dashboard.refreshing,
    notConnected: t.dashboard.calendarNotConnected,
    connectInSettings: t.dashboard.emailConnectInSettings,
    noEvents: t.dashboard.calendarNoEvents,
    today: t.dashboard.calendarToday,
    tomorrow: t.dashboard.calendarTomorrow,
    newEventsHeading: t.dashboard.calendarNewEventsHeading,
    newEventsEmpty: t.dashboard.calendarNewEventsEmpty,
  };

  // Defined once and rendered in two places (desktop and mobile each get
  // their own instance right below Social, same reasoning as every other
  // desktop/mobile card pair on this page — see the Pending Affiliate
  // Programs card's own comment) rather than duplicating this markup.
  const automationsCard = (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">
        {t.dashboard.automationsTitle}
      </h2>
      {automationEntries.length === 0 ? (
        <p className="mt-1.5 sm:mt-3 text-sm text-soft">
          {t.dashboard.noAutomationRuns}
        </p>
      ) : (
        <ul className="mt-1.5 sm:mt-3 space-y-2">
          {automationEntries.map((entry) =>
            entry.kind === "run" ? (
              <li
                key={entry.run.id}
                className="flex items-start gap-3 text-sm"
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                <div className="flex-1">
                  <p className="text-ink">
                    <span className="font-medium">
                      {entry.run.source === "make" ? "Make" : "Zapier"}
                    </span>
                    {entry.run.name ? ` · ${entry.run.name}` : ""}
                  </p>
                  {entry.run.message && (
                    <p className="text-xs text-soft">
                      {entry.run.message}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-xs font-medium text-red-600">
                    {t.dashboard.automationError}
                  </span>
                  <p className="text-xs text-soft">
                    {formatSmartDateTime(
                      entry.run.occurredAt,
                      dateLocale,
                      t,
                    )}
                  </p>
                </div>
              </li>
            ) : (
              <li
                key={`${entry.source}-${entry.name}-${entry.latest.getTime()}`}
                className="flex items-start gap-3 text-sm"
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <div className="flex-1">
                  <p className="text-ink">
                    <span className="font-medium">
                      {entry.source === "make" ? "Make" : "Zapier"}
                    </span>
                    {entry.name ? ` · ${entry.name}` : ""}
                  </p>
                  <p className="text-xs text-soft">
                    {t.dashboard.automationSuccessCount(entry.count)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-medium text-emerald-700">
                    {t.dashboard.automationSuccess}
                  </span>
                  <p className="text-xs text-soft">
                    {formatSmartDateTime(entry.latest, dateLocale, t)}
                  </p>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-2 sm:space-y-8">
      <PageHeader
        title={t.dashboard.title}
        hour12={hour12}
        lang={lang}
        location={t.dashboard.myLocation}
        logoUrl={AMO_LOGO_URL}
        logoAccessory={
          // Mobile: Weather and News share the top row (News to the right
          // of Weather), Sports spans the full row below them — desktop
          // keeps the original single-row Weather/News/Sports order via the
          // same named-area trick, just with all 3 areas in one row there.
          <div className="grid items-center gap-x-1.5 gap-y-0.5 [grid-template-areas:'weather_news'_'sports_sports'] [grid-template-columns:auto_auto] [grid-template-rows:auto_auto] sm:[grid-template-areas:'weather_news_sports'] sm:[grid-template-columns:auto_auto_auto] sm:[grid-template-rows:auto]">
            {!hiddenHeaderWidgets.includes("weather") && (
              <div className="min-w-0 [grid-area:weather]">
                <Suspense fallback={<WeatherWidgetSkeleton />}>
                  <WeatherHeaderServer lang={lang} labels={weatherLabels} />
                </Suspense>
              </div>
            )}
            {!hiddenHeaderWidgets.includes("news") && (
              <div className="min-w-0 [grid-area:news]">
                <Suspense fallback={<NewsWidgetSkeleton />}>
                  <NewsHeaderServer labels={newsLabels} />
                </Suspense>
              </div>
            )}
            {!hiddenHeaderWidgets.includes("sports") && (
              <div className="min-w-0 [grid-area:sports]">
                <Suspense fallback={<SportsWidgetSkeleton />}>
                  <SportsHeaderServer
                    league={sportsLeague}
                    teamNhl={sportsTeamNhl}
                    teamMlb={sportsTeamMlb}
                    leagueMobile={sportsLeagueMobile}
                    lang={lang}
                    hour12={hour12}
                    cardLabels={sportsLabels}
                    unavailableLabel={sportsUnavailableLabel}
                  />
                </Suspense>
              </div>
            )}
          </div>
        }
        dateTimeAccessory={
          // Mobile: Markets stacked directly above World Clock — desktop
          // keeps them side by side, same order, via the plain flex-col/
          // flex-row swap (no 3rd widget interleaved here, unlike the
          // Weather/News/Sports group above, so no grid-area trick needed).
          <div className="flex min-w-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
            {!hiddenHeaderWidgets.includes("markets") && (
              <Suspense fallback={<MarketsWidgetSkeleton />}>
                <MarketsHeaderServer
                  currency={marketsCurrency}
                  items={marketsItems}
                  itemMobile={marketsItemMobile}
                  labels={marketsLabels}
                />
              </Suspense>
            )}
            {!hiddenHeaderWidgets.includes("worldClock") && (
              <HeaderWorldClockWidget
                headerZones={headerZones}
                allZones={worldZones}
                mobileZone={headerZoneMobile}
                hour12={hour12}
                title={t.dashboard.worldClocksTitle}
              />
            )}
          </div>
        }
        hideDateTimeCard={hiddenHeaderWidgets.includes("dateTime")}
      />

      {/* Mobile: main's own p-4 (see app-shell.tsx) puts a 16px gap between
          every card here and both the sidebar and the right edge of the
          screen — cancelled (-mx-4) and replaced with a tighter 8px
          (px-2) just for this page. Desktop is unaffected (mx-0/px-0
          leaves main's own sm:p-8 as the only inset, same as every other
          page). */}
      <div className="-mx-4 space-y-2 px-2 sm:mx-0 sm:space-y-8 sm:px-0">
        {!integration?.apiKeyEncrypted && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t.dashboard.notConnected}{" "}
            <Link href="/settings" className="font-semibold underline">
              {t.dashboard.connectInSettings}
            </Link>{" "}
            {t.dashboard.connectSuffix}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <EmailSummaryCard
            connected={googleAccessToken !== null}
            counts={emailSummaryCounts}
            labels={emailSummaryLabels}
          />
          <CalendarSummaryCard
            connected={googleAccessToken !== null}
            counts={calendarSummaryCounts}
            labels={calendarSummaryLabels}
          />
          <ContactSummaryCard
            counts={contactSummaryCounts}
            labels={contactSummaryLabels}
          />
          <ProjectSummaryCard
            counts={projectSummaryCounts}
            labels={projectSummaryLabels}
          />
        </div>

        {/* Second summary row, below the first — its own grid rather than a
            5th/6th slot in the row above, since more summary cards are
            expected to join this row later. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <AffiliateProgramsSummaryCard
            counts={affiliateSummaryCounts}
            labels={affiliateSummaryLabels}
          />
          <SocialAnalyticsSummaryCard
            counts={socialSummaryCounts}
            labels={socialSummaryLabels}
          />
          <AutomationsSummaryCard
            counts={automationSummaryCounts}
            labels={automationsSummaryLabels}
          />
        </div>

        {/* A single flat grid (not three separately-flowing column divs) so
          each card can carry its own placement: no col-start below `lg`
          stacks every card full-width in DOM order (the mobile reading
          order the user asked for — Email, Calendar, Projects, Tasks,
          Social, then the right-column widgets). At `lg`+, `lg:col-start-*`
          alone (deliberately no row-start) pins each card to its original
          column while leaving its row auto — CSS grid's auto-placement then
          packs each column top-to-bottom independently, exactly like the
          old per-column flex flow, instead of syncing row heights across
          columns (which, tried first, left a large blank gap under any
          column whose cards were shorter than the tallest column's row —
          e.g. under the compact Calendar/Weather cards next to the Email
          card's own fixed 820px height). */}
        <div className="grid grid-cols-1 items-start gap-2 sm:gap-6 lg:grid-cols-3">
          {/* Email + the desktop-only Pending Affiliate Programs card are
              grouped into one flex-col grid item (same technique as the
              Contacts/Projects/Tasks group in column 3 below) instead of
              two separate col-start-1 grid items. A CSS Grid row's height
              is shared across every column, so even with an explicit
              row-start, a Pending card placed as its own grid item would
              still get stretched down to wherever row 1 actually ends —
              i.e. Calendar's own bottom whenever Calendar is taller than
              Email (a real production inbox next to a real, long event
              list), not Email's. Inside a shared flex-col item, Pending
              instead follows Email in plain in-flow layout, independent
              of how tall Calendar or the Contacts group happen to be. */}
          <div className="flex flex-col gap-2 sm:gap-6 lg:col-start-1">
            <div id="dashboard-email-card" className="scroll-mt-20">
              <EmailCard
                initialData={emailInitialData}
                connected={googleAccessToken !== null}
                hour12={hour12}
                lang={lang}
                addressColors={addressColors}
                contactOptions={emailLinkContactOptions}
                projectOptions={emailLinkProjectOptions}
                taskOptions={emailLinkTaskOptions}
                programOptions={emailLinkProgramOptions}
                labels={emailLabels}
              />
            </div>

            <div className="hidden lg:block">
              <PendingAffiliateProgramsCard
                id="dashboard-pending-affiliate-programs-card-desktop"
                programs={pendingAffiliatePrograms}
                lang={lang}
                labels={pendingAffiliateProgramsLabels}
              />
            </div>
          </div>

          {/* Calendar + the desktop-only Social Media Analytics card are
              grouped into one flex-col grid item (same technique as the
              Email/Pending Affiliate group in column 1 and the Contacts/
              Projects/Tasks group in column 3) instead of two separate
              col-start-2 items. A CSS Grid row's height is shared across
              every column, so even with an explicit row-start, a Social
              card placed as its own grid item would still get stretched
              down to wherever row 1 actually ends — i.e. the tallest of
              Email/Calendar/Contacts, not Calendar's own bottom. Inside a
              shared flex-col item, Social instead follows Calendar in
              plain in-flow layout, independent of how tall the other
              columns happen to be. */}
          <div className="flex flex-col gap-2 sm:gap-6 lg:col-start-2">
            <div id="dashboard-calendar-card" className="scroll-mt-20">
              <Suspense
                fallback={<CardSkeleton title={t.dashboard.calendarTitle} />}
              >
                <CalendarCardServer
                  accessToken={googleAccessToken}
                  lang={lang}
                  hour12={hour12}
                  labels={calendarLabels}
                />
              </Suspense>
            </div>

            <div className="hidden lg:block">
              <div id="dashboard-social-card-desktop" className="scroll-mt-20">
                <SocialCard
                  snapshots={socialSnapshots}
                  labels={socialLabels}
                  isAdmin={session?.user.role === "ADMIN"}
                  dateLocale={dateLocale}
                />
              </div>
            </div>

            <div className="hidden lg:block">
              <div id="dashboard-automations-card-desktop" className="scroll-mt-20">
                {automationsCard}
              </div>
            </div>
          </div>

          {/* Top of column 3 on desktop; on mobile (single-column stacking)
            this puts it right below the Calendar card, per the user's own
            placement. Contacts/Projects/Tasks are grouped into one flex
            column (one grid item) rather than three separate col-start-3
            items: as three separate items, auto-placement lands Contacts in
            the same implicit row as the Email card, and that row's height
            is forced to Email's own fixed 820px, leaving a large dead zone
            below the (much shorter) Contacts card before Projects starts in
            the next row. Grouping them removes that row-height coupling —
            the group is now sized by its own content — while keeping the
            normal `gap-2 sm:gap-6` spacing between all three cards, same as
            every other pair of cards on the page. */}
          <div className="flex flex-col gap-2 sm:gap-6 lg:col-start-3">
            <div id="dashboard-contacts-card" className="scroll-mt-20">
              <NewContactsCard
                today={newContactsToday}
                yesterday={newContactsYesterday}
                thisWeek={newContactsThisWeek}
                stageLabels={t.stages}
                labels={newContactsLabels}
              />
            </div>

            <div
              id="dashboard-projects-card"
              className={`relative overflow-hidden rounded-2xl border border-card-border p-2 shadow-sm sm:p-5 scroll-mt-20 ${PROJECT_CARD_BG}`}
            >
              <div className={`absolute inset-x-0 top-0 h-[3px] ${PROJECT_CARD_ACCENT_BAR}`} />
              <div className="flex items-center gap-2">
                <ProjectsIcon size="h-8 w-8" iconSize="h-5 w-5" />
                <h2 className="font-display text-lg font-semibold text-ink">
                  {t.dashboard.dashboardProjectsTitle}
                </h2>
              </div>
              {activeProjects.length === 0 ? (
                <p className="mt-1.5 sm:mt-3 text-sm text-soft">
                  {t.dashboard.noActiveProjects}
                </p>
              ) : (
                <ul className="mt-1.5 sm:mt-3 space-y-3">
                  {activeProjects.map((project) => (
                    <li
                      key={project.id}
                      className="flex items-start gap-3 text-sm"
                    >
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amo-lime" />
                      <div>
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-ink hover:text-emerald-700 hover:underline"
                        >
                          {project.name}
                        </Link>
                        <p className="text-xs text-soft">
                          {project.contact.firstName ?? project.contact.email}
                          {project.dueDate &&
                            ` · ${t.dashboard.due} ${formatDistanceToNow(project.dueDate, { addSuffix: true, locale: dateLocale })}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`relative overflow-hidden rounded-2xl border border-card-border p-2 shadow-sm sm:p-5 ${TASK_CARD_BG}`}>
              <div className={`absolute inset-x-0 top-0 h-[3px] ${TASK_CARD_ACCENT_BAR}`} />
              <div className="flex items-center gap-2">
                <TasksIcon size="h-8 w-8" iconSize="h-5 w-5" />
                <h2 className="font-display text-lg font-semibold text-ink">
                  {t.dashboard.upcomingTasks}
                </h2>
              </div>
              {dueSoonTasks.length === 0 ? (
                <p className="mt-1.5 sm:mt-3 text-sm text-soft">
                  {t.dashboard.noUpcomingTasks}
                </p>
              ) : (
                <ul className="mt-1.5 sm:mt-3 space-y-3">
                  {dueSoonTasks.map((task) => (
                    <li key={task.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amo-teal" />
                      <div>
                        <Link
                          href={`/projects/${task.projectId}`}
                          className="font-medium text-ink hover:text-emerald-700 hover:underline"
                        >
                          {task.title}
                        </Link>
                        <p className="text-xs text-soft">
                          {task.project.name} ·{" "}
                          {task.project.contact.firstName ??
                            task.project.contact.email}
                          {task.dueDate &&
                            ` · ${t.dashboard.due} ${formatDistanceToNow(task.dueDate, { addSuffix: true, locale: dateLocale })}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Mobile only — its own separate instance from the desktop copy
              above (see that one's comment for why desktop needs an
              explicit lg:row-start instead of sharing this DOM position).
              Single-column mobile stacking follows DOM order, so sitting
              here — right after the Contacts/Projects/Tasks group — lands
              this card right after the Tasks card, exactly where it
              belongs on mobile; lg:hidden then removes it from the desktop
              grid entirely so it can't collide with the desktop copy's
              explicit cell or disturb the auto-placement cursor there. */}
          <div className="lg:hidden">
            <PendingAffiliateProgramsCard
              id="dashboard-pending-affiliate-programs-card-mobile"
              programs={pendingAffiliatePrograms}
              lang={lang}
              labels={pendingAffiliateProgramsLabels}
            />
          </div>

          {/* Mobile only — its own separate instance from the desktop copy
              above (see that one's comment for why desktop needs its own
              grid item rather than sharing this DOM position). Single-
              column mobile stacking follows DOM order, so sitting here —
              right after the mobile Pending Affiliate Programs card —
              keeps Social right where it already was on mobile; lg:hidden
              then removes it from the desktop grid entirely. */}
          <div className="lg:hidden">
            <div id="dashboard-social-card-mobile" className="scroll-mt-20">
              <SocialCard
                snapshots={socialSnapshots}
                labels={socialLabels}
                isAdmin={session?.user.role === "ADMIN"}
                dateLocale={dateLocale}
              />
            </div>
          </div>

          {/* Mobile-only Automations instance, right after mobile Social —
              its own separate instance from the desktop copy above, same
              dual-instance reasoning as every other desktop/mobile card
              pair on this page. */}
          <div className="lg:hidden">
            <div id="dashboard-automations-card-mobile" className="scroll-mt-20">
              {automationsCard}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
