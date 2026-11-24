import type { PrismaClient } from "@/lib/prisma";
import { getCachedInbox, getScreeningExtras } from "@/lib/email-inbox";
import { getUpcomingEvents, getValidAccessToken } from "@/lib/google";
import { makeClientWith, refreshMakeRunsQuietly } from "@/lib/automations";
import { MAKE_FAILED_STORE_ID } from "@/lib/social-weekly";
import { ACTIVE_PROJECT_STATUSES } from "@/lib/project-status";
import { APP_TIME_ZONE, startOfTodayInZone } from "@/lib/user-timezone";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { notifyUsers } from "@/lib/push";

// The CRM's Daily Briefing: what came in over the last 24 hours (important emails, texts, contacts, failures) plus
// everything due or overdue today. Shown on /briefing and pushed once each morning (see sendDailyBriefings).

export const BRIEFING_SECTIONS = [
  "emails",
  "sms",
  "events",
  "contacts",
  "tasks",
  "projects",
  "affiliates",
  "social",
  "automations",
  "posts",
  "invoices",
  "proposals",
  "accounting",
] as const;
export type BriefingSectionKey = (typeof BRIEFING_SECTIONS)[number];

export interface BriefingItem {
  title: string;
  detail?: string;
  url: string;
  external?: boolean;
  urgent?: boolean;
}

export interface DailyBriefing {
  generatedAt: string;
  sections: Record<BriefingSectionKey, BriefingItem[]>;
  notes: Partial<Record<BriefingSectionKey, string>>;
}

/** Local hour (Toronto/Montréal time) from which the morning push goes out. */
export const BRIEFING_HOUR = 7;

const DAY = 86_400_000;

function localeOf(lang: Lang) {
  return lang === "fr" ? "fr-CA" : "en-CA";
}

function fmtDate(d: Date, lang: Lang) {
  return d.toLocaleDateString(localeOf(lang), { month: "short", day: "numeric", timeZone: APP_TIME_ZONE });
}

function fmtTime(d: Date, lang: Lang) {
  return d.toLocaleTimeString(localeOf(lang), { hour: "numeric", minute: "2-digit", timeZone: APP_TIME_ZONE });
}

function fmtMoney(n: number, currency: string, lang: Lang) {
  return new Intl.NumberFormat(localeOf(lang), { style: "currency", currency }).format(n);
}

function localYmd(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE });
}

function snippet(s: string | null | undefined, max = 90) {
  const clean = (s ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function personName(c: { firstName: string | null; lastName: string | null; email?: string | null } | null | undefined) {
  if (!c) return null;
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || null;
}

export async function buildDailyBriefing(db: PrismaClient, user: { id: string; language: "EN" | "FR" }, accessToken: string | null): Promise<DailyBriefing> {
  const lang: Lang = user.language === "FR" ? "fr" : "en";
  const t = getDict(lang).briefing;
  const now = new Date();
  const since = new Date(now.getTime() - DAY);
  const todayStart = startOfTodayInZone();
  const todayEnd = new Date(todayStart.getTime() + DAY);
  const todayYmd = localYmd(now);

  const sections = Object.fromEntries(BRIEFING_SECTIONS.map((k) => [k, [] as BriefingItem[]])) as Record<BriefingSectionKey, BriefingItem[]>;
  const notes: DailyBriefing["notes"] = {};

  // Each section is independent: one source failing (Gmail, Make, ...) leaves a note instead of breaking the rest.
  const section = async (key: BriefingSectionKey, fill: () => Promise<void>) => {
    try {
      await fill();
    } catch {
      notes[key] = t.unavailable;
    }
  };

  await section("emails", async () => {
    const snapshot = await getCachedInbox(db, user.id);
    if (!snapshot) {
      notes.emails = t.notConnected;
      return;
    }
    const fresh = snapshot.emails.filter((e) => new Date(e.date) >= since);
    const extras = await getScreeningExtras(db, { ...snapshot, emails: fresh, sentAwaitingReply: [] }, user.id);
    const rank = (id: string) => (extras.classifications[id] === "NEEDS_REPLY" ? 0 : 1);
    sections.emails = fresh
      .filter((e) => !extras.completions[e.id] && ["NEEDS_REPLY", "NEEDS_ATTENTION"].includes(extras.classifications[e.id] ?? ""))
      .sort((a, b) => rank(a.id) - rank(b.id) || b.date.localeCompare(a.date))
      .map((e) => ({
        title: e.from.replace(/<.*>/, "").replace(/"/g, "").trim() || e.fromEmail,
        detail: `${extras.classifications[e.id] === "NEEDS_REPLY" ? t.needsReply : t.needsAttention} · ${snippet(e.subject, 80) || t.noSubject}`,
        url: "/email",
        urgent: extras.classifications[e.id] === "NEEDS_REPLY",
      }));
  });

  await section("sms", async () => {
    const texts = await db.interaction.findMany({
      where: { type: "SMS", direction: "INBOUND", OR: [{ seenAt: null }, { occurredAt: { gte: since } }] },
      orderBy: { occurredAt: "desc" },
      take: 20,
      include: { contact: { select: { firstName: true, lastName: true, email: true } } },
    });
    sections.sms = texts.map((m) => ({
      title: personName(m.contact) ?? t.unknownNumber,
      detail: `${fmtTime(m.occurredAt, lang)}${localYmd(m.occurredAt) === todayYmd ? "" : ` (${fmtDate(m.occurredAt, lang)})`} · ${snippet(m.summary || m.notes)}`,
      url: "/sms",
      urgent: m.seenAt === null,
    }));
  });

  await section("events", async () => {
    if (!accessToken) {
      notes.events = t.notConnected;
      return;
    }
    const events = (await getUpcomingEvents(accessToken)) ?? [];
    const today = events
      .filter((ev) => (ev.allDay ? ev.start === todayYmd : ev.start && new Date(ev.start) >= todayStart && new Date(ev.start) < todayEnd))
      .sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || (a.start ?? "").localeCompare(b.start ?? ""));
    sections.events = today.map((ev) => ({
      title: ev.title || t.untitled,
      detail: ev.allDay ? t.allDay : `${fmtTime(new Date(ev.start!), lang)}${ev.end ? ` – ${fmtTime(new Date(ev.end), lang)}` : ""}`,
      url: "/calendar-app",
      urgent: /discovery/i.test(ev.title),
    }));
  });

  await section("contacts", async () => {
    const contacts = await db.contact.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, firstName: true, lastName: true, email: true, source: true },
    });
    sections.contacts = contacts.map((c) => ({
      title: personName(c) ?? t.untitled,
      detail: [c.email, c.source].filter(Boolean).join(" · ") || undefined,
      url: `/contacts/${c.id}`,
    }));
  });

  await section("tasks", async () => {
    const tasks = await db.task.findMany({
      where: { OR: [{ status: { in: ["TODO", "IN_PROGRESS"] }, dueDate: { lt: todayEnd } }, { status: "BLOCKED" }] },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 50,
      select: { id: true, title: true, status: true, dueDate: true, project: { select: { name: true } } },
    });
    sections.tasks = tasks.map((task) => {
      const overdue = task.dueDate !== null && task.dueDate < todayStart;
      const when = task.status === "BLOCKED" ? t.blocked : overdue ? t.overdueSince.replace("{date}", fmtDate(task.dueDate!, lang)) : t.dueToday;
      return { title: task.title, detail: [when, task.project?.name].filter(Boolean).join(" · "), url: `/tasks/${task.id}`, urgent: overdue };
    });
  });

  await section("projects", async () => {
    const projects = await db.project.findMany({
      where: { status: { in: ACTIVE_PROJECT_STATUSES }, dueDate: { lt: todayEnd } },
      orderBy: { dueDate: "asc" },
      take: 30,
      select: { id: true, name: true, dueDate: true, contact: { select: { firstName: true, lastName: true, email: true } } },
    });
    sections.projects = projects.map((p) => {
      const overdue = p.dueDate! < todayStart;
      return {
        title: p.name,
        detail: [overdue ? t.overdueSince.replace("{date}", fmtDate(p.dueDate!, lang)) : t.dueToday, personName(p.contact)].filter(Boolean).join(" · "),
        url: `/projects/${p.id}`,
        urgent: overdue,
      };
    });
  });

  await section("affiliates", async () => {
    const programs = await db.affiliateProgram.findMany({
      where: { followUpNeeded: true, OR: [{ followUpDate: null }, { followUpDate: { lt: todayEnd } }] },
      orderBy: [{ followUpDate: { sort: "asc", nulls: "last" } }, { name: "asc" }],
      take: 50,
      select: { id: true, name: true, followUpDate: true, affiliateStatus: true },
    });
    sections.affiliates = programs.map((p) => ({
      title: p.name,
      detail: [p.followUpDate ? t.followUpDue.replace("{date}", fmtDate(p.followUpDate, lang)) : t.followUpNeeded, p.affiliateStatus].filter(Boolean).join(" · "),
      url: `/marketing/programs/${p.id}`,
      urgent: p.followUpDate !== null && p.followUpDate < todayStart,
    }));
  });

  await section("social", async () => {
    const posts = await db.socialPost.findMany({
      where: { status: "SENT", postedAt: { gte: new Date(now.getTime() - 7 * DAY) } },
      orderBy: { postedAt: "desc" },
      select: { platform: true, language: true, text: true, link: true, metrics: true },
    });
    const withComments = posts
      .map((p) => {
        const metrics = (p.metrics ?? {}) as Record<string, number>;
        const key = Object.keys(metrics).find((k) => /^comments?$/i.test(k));
        return { ...p, comments: key ? Number(metrics[key]) || 0 : 0 };
      })
      .filter((p) => p.comments > 0);
    sections.social = withComments.map((p) => ({
      title: `${p.platform.charAt(0).toUpperCase()}${p.platform.slice(1)} ${p.language}`,
      detail: `${t.comments.replace("{n}", String(p.comments))} · ${snippet(p.text, 70)}`,
      url: p.link ?? "/social-analytics",
      external: Boolean(p.link),
    }));
    if (withComments.length > 0) notes.social = t.commentsNote;
  });

  await section("automations", async () => {
    // Make runs are only pulled on demand (the Dashboard does it in the background); pull them now so this is current.
    await refreshMakeRunsQuietly(db).catch(() => undefined);
    const failures = await db.automationRun.findMany({
      where: { status: "error", occurredAt: { gte: since } },
      orderBy: { occurredAt: "desc" },
      select: { source: true, name: true, occurredAt: true },
    });
    const groups = new Map<string, { source: string; name: string; count: number; last: Date }>();
    for (const f of failures) {
      const name = f.name ?? f.source;
      const key = `${f.source}|${name}`;
      const g = groups.get(key);
      if (g) g.count += 1;
      else groups.set(key, { source: f.source, name, count: 1, last: f.occurredAt });
    }
    sections.automations = [...groups.values()].map((g) => ({
      title: g.name,
      detail: `${g.source === "make" ? "Make" : "Zapier"} · ${t.failedRuns.replace("{n}", String(g.count)).replace("{time}", fmtTime(g.last, lang))}`,
      url: "/",
      urgent: true,
    }));
  });

  await section("posts", async () => {
    const client = await makeClientWith(db);
    if (!client) {
      notes.posts = t.makeNotConnected;
      return;
    }
    const records = await client.listDataStoreRecords(MAKE_FAILED_STORE_ID);
    const fresh = records
      .map((r) => ({ data: r.data, failedAt: r.data.failed_at ? new Date(String(r.data.failed_at)) : null }))
      .filter((r) => r.failedAt && !Number.isNaN(r.failedAt.getTime()) && r.failedAt >= since)
      .sort((a, b) => b.failedAt!.getTime() - a.failedAt!.getTime());
    sections.posts = fresh.map((r) => ({
      title: String(r.data.platform ?? "Post"),
      detail: `${t.failedAt.replace("{time}", fmtTime(r.failedAt!, lang))}${r.data.caption || r.data.text ? ` · ${snippet(String(r.data.caption ?? r.data.text), 70)}` : ""}`,
      url: "/social-analytics",
      urgent: true,
    }));
    if (records.length > 0) notes.posts = t.postsInStore.replace("{n}", String(records.length));
  });

  await section("invoices", async () => {
    const soon = new Date(todayStart.getTime() + 3 * DAY);
    const invoices = await db.invoice.findMany({
      where: { OR: [{ status: "OVERDUE" }, { status: "APPROVED" }, { status: "SENT", dueDate: { lt: soon } }] },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 50,
      select: { id: true, number: true, status: true, dueDate: true, totalAmount: true, currency: true, projectId: true, project: { select: { name: true } } },
    });
    sections.invoices = invoices.map((inv) => {
      const amount = fmtMoney(inv.totalAmount, inv.currency || "CAD", lang);
      const pastDue = inv.status === "OVERDUE" || (inv.dueDate !== null && inv.dueDate < todayStart && inv.status === "SENT");
      const detail =
        inv.status === "APPROVED"
          ? t.invoiceToSend.replace("{amount}", amount)
          : pastDue
            ? t.invoiceOverdue.replace("{amount}", amount)
            : t.invoiceDue.replace("{date}", fmtDate(inv.dueDate!, lang)).replace("{amount}", amount);
      return {
        title: `${inv.number ?? t.invoice} — ${inv.project.name}`,
        detail,
        url: `/projects/${inv.projectId}/invoices/${inv.id}`,
        urgent: pastDue,
      };
    });
  });

  await section("proposals", async () => {
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const proposals = await db.proposal.findMany({
      where: { OR: [{ status: "APPROVED" }, { status: "SENT", sentAt: { lt: weekAgo } }] },
      orderBy: { updatedAt: "asc" },
      take: 50,
      select: { id: true, title: true, status: true, sentAt: true, projectId: true, project: { select: { name: true } } },
    });
    sections.proposals = proposals.map((p) => ({
      title: `${p.title} — ${p.project.name}`,
      detail:
        p.status === "APPROVED"
          ? t.proposalToSend
          : t.proposalFollowUp.replace("{n}", String(Math.floor((now.getTime() - (p.sentAt?.getTime() ?? now.getTime())) / DAY))),
      url: `/projects/${p.projectId}/proposals/${p.id}`,
    }));
  });

  await section("accounting", async () => {
    const toCategorize = await db.accTransaction.count({
      where: { status: { in: ["NEW", "SUGGESTED"] }, account: { entity: { ownerId: user.id } } },
    });
    if (toCategorize > 0) {
      sections.accounting.push({ title: t.toCategorize.replace("{n}", String(toCategorize)), url: "/accounting/transactions" });
    }
    const statementAccounts = await db.accAccount.findMany({
      where: { entity: { ownerId: user.id }, subtype: { in: ["BANK", "CREDIT_CARD"] }, archived: false },
      orderBy: { name: "asc" },
      select: { name: true, batches: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
    });
    const monthAgo = new Date(now.getTime() - 30 * DAY);
    for (const a of statementAccounts) {
      const last = a.batches[0]?.createdAt ?? null;
      if (last && last >= monthAgo) continue;
      sections.accounting.push({
        title: a.name,
        detail: last ? t.importDue.replace("{date}", fmtDate(last, lang)) : t.importNever,
        url: "/accounting/import",
      });
    }
  });

  return { generatedAt: now.toISOString(), sections, notes };
}

/** "3 important emails · 2 texts · 4 events · ..." — only the sections with something in them. */
export function briefingSummary(briefing: DailyBriefing, lang: Lang): string {
  const t = getDict(lang).briefing;
  return BRIEFING_SECTIONS.filter((k) => briefing.sections[k].length > 0)
    .map((k) => {
      const n = briefing.sections[k].length;
      return `${n} ${t.short[k][n === 1 ? 0 : 1]}`;
    })
    .join(" · ");
}

/**
 * The morning push. Called on every 15-minute email-poll tick; sends at most once per user per day, on the first tick
 * at or after BRIEFING_HOUR (GitHub's scheduler can run late, so it isn't tied to one exact window).
 */
export async function sendDailyBriefings(db: PrismaClient): Promise<number> {
  const hour = Number(new Date().toLocaleString("en-CA", { hour: "numeric", hourCycle: "h23", timeZone: APP_TIME_ZONE }));
  if (hour < BRIEFING_HOUR) return 0;
  const dedupeKey = `briefing:${localYmd(new Date())}`;
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, language: true } });
  let sent = 0;
  for (const user of admins) {
    const [hasDevice, alreadySent] = await Promise.all([
      db.pushSubscription.findFirst({ where: { userId: user.id }, select: { id: true } }),
      db.pushNotificationLog.findFirst({ where: { userId: user.id, key: dedupeKey }, select: { id: true } }),
    ]);
    if (!hasDevice || alreadySent) continue;
    const accessToken = await getValidAccessToken(user.id, db).catch(() => null);
    const briefing = await buildDailyBriefing(db, user, accessToken);
    const lang: Lang = user.language === "FR" ? "fr" : "en";
    const t = getDict(lang).briefing;
    const summary = briefingSummary(briefing, lang);
    const urgent = BRIEFING_SECTIONS.some((k) => briefing.sections[k].some((i) => i.urgent));
    sent += await notifyUsers(db, { to: [user.id], category: "briefing", dedupeKey, urgent }, {
      title: t.pushTitle,
      body: summary || t.allClearBody,
      url: "/briefing",
    });
  }
  return sent;
}
