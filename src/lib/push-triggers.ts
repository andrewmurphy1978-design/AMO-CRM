import type { PrismaClient } from "@/lib/prisma";
import type { CalendarEventSummary, EmailSummary } from "@/lib/google";
import { notifyUsers } from "@/lib/push";

// What raises each push notification. Everything here is safe to run on every 15-minute tick: notifyUsers never sends
// the same dedupeKey to the same user twice.

const DISCOVERY = /discovery/i;

function montrealTime(d: Date): string {
  return d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Montreal" });
}
function montrealDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Montreal" });
}

/** New emails since the previous snapshot of this user's inbox (nothing on the very first sync). */
export async function notifyNewEmails(db: PrismaClient, userId: string, before: EmailSummary[] | null, after: EmailSummary[]): Promise<void> {
  if (!before) return;
  const known = new Set(before.map((e) => e.id));
  const fresh = after.filter((e) => !known.has(e.id) && Date.now() - new Date(e.date).getTime() < 6 * 3600 * 1000);
  if (fresh.length === 0) return;
  const first = fresh[0];
  const sender = (e: EmailSummary) => e.from.replace(/<.*>/, "").replace(/"/g, "").trim() || e.fromEmail;
  const payload =
    fresh.length === 1
      ? { title: `✉️ ${sender(first)}`, body: first.subject || "(no subject)", url: "/email" }
      : { title: `✉️ ${fresh.length} new emails`, body: fresh.slice(0, 3).map((e) => `${sender(e)}: ${e.subject}`).join("\n"), url: "/email" };
  await notifyUsers(db, { to: [userId], category: "email", dedupeKey: `email:${fresh.map((e) => e.id).slice(0, 3).join(",")}`, urgent: fresh.some((e) => e.important) }, payload);
}

/** Calendar reminders, with extra attention for Discovery calls: heads-up when one is booked, an hour before, and 15 minutes before. */
export async function notifyCalendar(db: PrismaClient, userId: string, events: CalendarEventSummary[]): Promise<void> {
  const now = Date.now();
  for (const ev of events) {
    if (ev.allDay || !ev.start) continue;
    const start = new Date(ev.start);
    const mins = (start.getTime() - now) / 60000;
    if (mins <= 0) continue;
    const key = `${ev.id}:${ev.start}`;
    const url = "/calendar";
    if (DISCOVERY.test(ev.title)) {
      const booked = ev.created ? now - new Date(ev.created).getTime() < 2 * 3600 * 1000 : false;
      if (booked) {
        await notifyUsers(db, { to: [userId], category: "calendar", dedupeKey: `cal:disc:new:${key}`, urgent: true }, {
          title: "📞 New Discovery call booked",
          body: `${ev.title} — ${montrealDay(start)} at ${montrealTime(start)}`,
          url,
        });
      }
      if (mins <= 75) {
        await notifyUsers(db, { to: [userId], category: "calendar", dedupeKey: `cal:disc:60:${key}`, urgent: true }, {
          title: "📞 Discovery call in about an hour",
          body: `${ev.title} at ${montrealTime(start)}`,
          url,
        });
      }
      if (mins <= 20) {
        await notifyUsers(db, { to: [userId], category: "calendar", dedupeKey: `cal:disc:15:${key}`, urgent: true }, {
          title: "📞 Discovery call starting soon",
          body: `${ev.title} at ${montrealTime(start)}`,
          url,
        });
      }
    } else if (mins <= 20) {
      await notifyUsers(db, { to: [userId], category: "calendar", dedupeKey: `cal:15:${key}` }, {
        title: `📅 In ${Math.max(1, Math.round(mins))} min: ${ev.title}`,
        body: `${montrealTime(start)}`,
        url,
      });
    }
  }
}

/** Contacts created in the last 45 minutes (form, systeme.io, import...). More than 3 at once collapse into one message. */
export async function notifyNewContacts(db: PrismaClient): Promise<void> {
  const recent = await db.contact.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 45 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, firstName: true, lastName: true, email: true, company: true },
    take: 100,
  });
  if (recent.length === 0) return;
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  const seen = new Set((await db.pushNotificationLog.findMany({ where: { userId: { in: admins.map((a) => a.id) }, key: { in: recent.map((c) => `contact:${c.id}`) } }, select: { key: true } })).map((r) => r.key));
  const fresh = recent.filter((c) => !seen.has(`contact:${c.id}`));
  if (fresh.length === 0) return;
  const label = (c: (typeof fresh)[number]) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "New contact";
  if (fresh.length <= 3) {
    for (const c of fresh) {
      await notifyUsers(db, { to: "admins", category: "contact", dedupeKey: `contact:${c.id}` }, {
        title: "👤 New contact",
        body: [label(c), c.company, c.email].filter(Boolean).join(" · "),
        url: `/contacts/${c.id}`,
      });
    }
    return;
  }
  await notifyUsers(db, { to: "admins", category: "contact", dedupeKey: `contacts:${fresh[0].id}` }, {
    title: `👤 ${fresh.length} new contacts`,
    body: fresh.slice(0, 3).map(label).join(", ") + "…",
    url: "/contacts",
  });
  await db.pushNotificationLog.createMany({ data: admins.flatMap((a) => fresh.map((c) => ({ userId: a.id, key: `contact:${c.id}` }))), skipDuplicates: true });
}

const PLATFORM_NAME: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", tiktok: "TikTok", x: "X", youtube: "YouTube" };

/**
 * New followers and positive analytics: compares each platform + language's latest snapshot with the one before it.
 * Followers up by any amount, engagement or views up by 20% or more (and at least 10).
 */
export async function notifySocialHighlights(db: PrismaClient): Promise<void> {
  const rows = await db.socialAnalyticsSnapshot.findMany({
    where: { dateKey: { gte: new Date(Date.now() - 14 * 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Montreal" }) } },
    orderBy: { dateKey: "desc" },
  });
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.platform}|${r.language}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const followerLines: string[] = [];
  const positiveLines: string[] = [];
  let latestKey = "";
  for (const [k, list] of byKey) {
    if (list.length < 2) continue;
    const [now, prev] = list;
    latestKey = latestKey > now.dateKey ? latestKey : now.dateKey;
    const name = `${PLATFORM_NAME[now.platform] ?? now.platform} ${now.language}`;
    if (now.followers !== null && prev.followers !== null && now.followers > prev.followers) followerLines.push(`${name} +${now.followers - prev.followers}`);
    for (const [label, a, b] of [["engagement", now.engagement, prev.engagement], ["views", now.views, prev.views]] as const) {
      if (a !== null && b !== null && b > 0 && a - b >= 10 && a / b >= 1.2) positiveLines.push(`${name} ${label} +${Math.round((a / b - 1) * 100)}%`);
    }
    void k;
  }
  if (followerLines.length > 0) {
    await notifyUsers(db, { to: "admins", category: "social", dedupeKey: `social:followers:${latestKey}:${followerLines.join("|")}` }, {
      title: "🎉 New followers",
      body: followerLines.slice(0, 6).join("\n"),
      url: "/social-analytics",
    });
  }
  if (positiveLines.length > 0) {
    await notifyUsers(db, { to: "admins", category: "social", dedupeKey: `social:growth:${latestKey}:${positiveLines.join("|")}` }, {
      title: "📈 Social media is trending up",
      body: positiveLines.slice(0, 6).join("\n"),
      url: "/social-analytics",
    });
  }
}

/** Invoices that just turned overdue. */
export async function notifyOverdueInvoices(db: PrismaClient): Promise<void> {
  const overdue = await db.invoice.findMany({ where: { status: "OVERDUE" }, select: { id: true, number: true, totalAmount: true, amount: true, currency: true, projectId: true } });
  for (const inv of overdue) {
    await notifyUsers(db, { to: "admins", category: "invoice", dedupeKey: `invoice:overdue:${inv.id}` }, {
      title: "⚠️ Invoice overdue",
      body: `${inv.number ? `#${inv.number} · ` : ""}${(inv.totalAmount || inv.amount).toLocaleString("en-CA", { style: "currency", currency: inv.currency })}`,
      url: `/projects/${inv.projectId}/invoices/${inv.id}`,
    });
  }
}
