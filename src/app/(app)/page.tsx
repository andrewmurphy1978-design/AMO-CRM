import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import {
  formatDistanceToNow,
  format,
  isToday,
  isYesterday,
  startOfWeek,
  addDays,
  type Locale,
} from "date-fns";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import WorldClocks from "./world-clocks";
import PageHeader from "./page-header";
import CardSkeleton from "./card-skeleton";
import WeatherCardServer from "./weather-card-server";
import NewsCardServer from "./news-card-server";
import SportsCardServer from "./sports-card-server";
import MarketsCardServer from "./markets-card-server";
import EmailCard from "./email-card";
import EmailSummaryCard from "./email-summary-card";
import CalendarCardServer from "./calendar-card-server";
import CalendarSummaryCard from "./calendar-summary-card";
import NewContactsCard from "./new-contacts-card";
import ContactSummaryCard from "./contact-summary-card";
import {
  getCachedInbox,
  getScreeningExtras,
  type EmailScreeningPayload,
} from "@/lib/email-inbox";
import SocialCard from "./social-card";
import {
  getValidAccessToken,
  getCalendarEventsInRange,
  getRecentlyCreatedEvents,
  type CalendarEventSummary,
} from "@/lib/google";
import { getLatestSocialSnapshots } from "@/lib/social";
import { getHour12 } from "@/lib/time-format";
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
  if (isToday(date)) return t.dashboard.todayAt(time);
  if (isYesterday(date)) return t.dashboard.yesterdayAt(time);
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

const STAT_ICONS = {
  contacts: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
    />
  ),
  projects: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-19.5 0v6a2.25 2.25 0 0 0 2.25 2.25h15a2.25 2.25 0 0 0 2.25-2.25v-6m-19.5 0h19.5M12 6.75h.008v.008H12V6.75Z"
    />
  ),
  tasks: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  ),
} as const;

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
    dueSoonTasks,
    activeProjects,
    recentActivity,
    newContactsList,
    totalContactCount,
    contactsBySource,
    contactsByStage,
    integration,
    recentRuns,
    googleAccessToken,
    socialSnapshots,
    hour12,
    emailInitialData,
    addressColors,
    linkContacts,
    linkProjects,
    linkTasks,
    linkAffiliatePrograms,
  } = await withScopedPrismaClient(async (db) => {
    const activeProjectCount = await db.project.count({
      where: { status: "ACTIVE" },
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
    const recentActivity = await db.activityLogEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { contact: true, project: true },
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
    const recentRuns = await db.automationRun.findMany({
      orderBy: { occurredAt: "desc" },
      take: 30,
    });
    const googleAccessToken = session
      ? await getValidAccessToken(session.user.id, db)
      : null;
    const socialSnapshots = await getLatestSocialSnapshots(db);
    const hour12 = await getHour12(session, db);
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
      select: { id: true, firstName: true, lastName: true, email: true },
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
      select: { id: true, name: true },
    });

    // Reads the same cached inbox snapshot the Email page maintains — no
    // live Gmail/Claude call here, just a DB read, so this can share this
    // block's one connection instead of the email card doing its own
    // scoped read from inside a concurrently-rendered Suspense boundary
    // (which is exactly the pattern that trips Cloudflare's Error 1102:
    // two Suspense children each opening their own connection at once).
    const emailInitialData: EmailScreeningPayload | null =
      googleAccessToken && session
        ? await (async () => {
            const snapshot = await getCachedInbox(db, session.user.id);
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
      dueSoonTasks,
      activeProjects,
      recentActivity,
      newContactsList,
      totalContactCount,
      contactsBySource,
      contactsByStage,
      integration,
      recentRuns,
      googleAccessToken,
      socialSnapshots,
      hour12,
      emailInitialData,
      addressColors,
      linkContacts,
      linkProjects,
      linkTasks,
      linkAffiliatePrograms,
    };
  });
  const automationEntries = groupAutomationRuns(recentRuns).slice(0, 8);

  // Feeds the Email card's "Linked to" picker — same option shapes the
  // Email page itself builds from the equivalent full-list queries above.
  const emailLinkContactOptions = linkContacts.map((c) => ({
    id: c.id,
    label: contactLabel(c),
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
  }));

  // Feeds the Email Summary stat card — same classification/completion/
  // read-state rules the Email card itself applies to its NEEDS_ATTENTION/
  // CAN_WAIT sections, just counted instead of rendered. Drafts aren't
  // included here since (like the Email card) they're only ever available
  // via a live client-side fetch — the Summary card fetches its own count.
  const emailToday = (emailInitialData?.emails ?? []).filter((e) =>
    isToday(new Date(e.date)),
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
  // (not inside the DB callback) since isToday/isYesterday just need plain
  // JS Dates, not another query.
  const newContactsToday = newContactsList.filter((c) => isToday(c.createdAt));
  const newContactsYesterday = newContactsList.filter((c) =>
    isYesterday(c.createdAt),
  );
  const newContactsThisWeek = newContactsList.filter(
    (c) => !isToday(c.createdAt) && !isYesterday(c.createdAt),
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

  const stats = [
    {
      label: t.dashboard.statActiveProjects,
      value: activeProjectCount,
      sub: null,
      href: "/projects?status=ACTIVE",
      icon: STAT_ICONS.projects,
      color: "blue",
    },
  ] as const;

  const colorClasses = {
    lime: "bg-emerald-50 text-emerald-700",
    teal: "bg-teal-50 text-teal-700",
    blue: "bg-sky-50 text-sky-700",
    gold: "bg-amber-100 text-amber-700",
  } as const;

  return (
    <div className="space-y-2 sm:space-y-8">
      <PageHeader
        title={t.dashboard.title}
        hour12={hour12}
        lang={lang}
        location={t.dashboard.myLocation}
        logoUrl={AMO_LOGO_URL}
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
          {stats.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="group relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5 transition-all duration-200 hover:-translate-y-1 hover:border-amo-lime/40 hover:shadow-[0_12px_28px_rgba(46,204,113,0.15)]"
            >
              <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <div
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${colorClasses[stat.color]}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="h-5 w-5"
                >
                  {stat.icon}
                </svg>
              </div>
              <p className="mt-4 font-display text-2xl font-semibold text-ink">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-soft">{stat.label}</p>
              {stat.sub && (
                <p className="mt-0.5 text-xs text-soft">{stat.sub}</p>
              )}
            </Link>
          ))}
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
          <div
            id="dashboard-email-card"
            className="lg:col-start-1 scroll-mt-20"
          >
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

          <div
            id="dashboard-calendar-card"
            className="lg:col-start-2 scroll-mt-20"
          >
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

          {/* Top of column 3 on desktop; on mobile (single-column stacking)
            this puts it right below the Calendar card, per the user's own
            placement — Projects/Tasks (also moved to col-start-3 below,
            right after this in DOM) then follow it in both layouts. */}
          <div
            id="dashboard-contacts-card"
            className="lg:col-start-3 scroll-mt-20"
          >
            <NewContactsCard
              today={newContactsToday}
              yesterday={newContactsYesterday}
              thisWeek={newContactsThisWeek}
              stageLabels={t.stages}
              labels={newContactsLabels}
            />
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5 lg:col-start-3">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">
              {t.dashboard.dashboardProjectsTitle}
            </h2>
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

          <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5 lg:col-start-3">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">
              {t.dashboard.upcomingTasks}
            </h2>
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

          <div className="lg:col-start-2">
            <SocialCard
              snapshots={socialSnapshots}
              labels={socialLabels}
              isAdmin={session?.user.role === "ADMIN"}
              dateLocale={dateLocale}
            />
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5 lg:col-start-1">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">
              {t.dashboard.recentActivity}
            </h2>
            {recentActivity.length === 0 ? (
              <p className="mt-1.5 sm:mt-3 text-sm text-soft">
                {t.dashboard.noActivity}
              </p>
            ) : (
              <ul className="mt-1.5 sm:mt-3 space-y-3">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amo-blue" />
                    <div>
                      <p className="text-ink">{entry.message}</p>
                      <p className="text-xs text-soft">
                        {formatDistanceToNow(entry.createdAt, {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5 lg:col-start-2">
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

          {/* Right-column widgets: each fetches real, sometimes slow,
            external data — Suspense lets the rest of the dashboard render
            immediately instead of waiting on all of them. */}
          <div className="lg:col-start-3">
            <Suspense
              fallback={<CardSkeleton title={t.dashboard.weatherTitle} />}
            >
              <WeatherCardServer lang={lang} labels={weatherLabels} />
            </Suspense>
          </div>
          <div className="lg:col-start-3">
            <WorldClocks title="World clocks" hour12={hour12} />
          </div>
          <div className="lg:col-start-3">
            <Suspense fallback={<CardSkeleton title={t.dashboard.newsTitle} />}>
              <NewsCardServer labels={newsLabels} />
            </Suspense>
          </div>
          <div className="lg:col-start-3">
            <Suspense
              fallback={<CardSkeleton title={t.dashboard.sportsTitle} />}
            >
              <SportsCardServer
                labels={sportsLabels}
                lang={lang}
                hour12={hour12}
              />
            </Suspense>
          </div>
          <div className="lg:col-start-3">
            <Suspense
              fallback={<CardSkeleton title={t.dashboard.marketsTitle} />}
            >
              <MarketsCardServer labels={marketsLabels} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
