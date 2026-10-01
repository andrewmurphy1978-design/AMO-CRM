import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getHour12 } from "@/lib/time-format";
import { getTwilioConfig } from "@/lib/twilio";
import type { CallsSmsEntry } from "../contacts/[id]/calls-sms-dialog";
import PageHeader from "../page-header";
import SmsIcon from "../sms-icon";
import SmsInbox, { type UnlinkedGroup, type NewText } from "./sms-inbox";

const sevenDaysAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

// The SMS inbox: incoming texts nobody has looked at yet, plus texts from
// numbers that match no contact (those stay here until linked).
export default async function SmsPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);

  const { unlinked, fresh, noProject, contacts, projects, phases, tasks, twilioReady, hour12 } = await withScopedPrismaClient(async (db) => {
    const include = { loggedBy: true, updatedBy: true } as const;
    const unlinked = await db.interaction.findMany({
      where: { type: "SMS", direction: "INBOUND", contactId: null },
      orderBy: { occurredAt: "desc" },
      include,
    });
    const fresh = await db.interaction.findMany({
      where: { type: "SMS", direction: "INBOUND", contactId: { not: null }, seenAt: null },
      orderBy: { occurredAt: "desc" },
      include: { ...include, contact: { select: { id: true, firstName: true, lastName: true, company: true } } },
    });
    // Texts (received and sent) of the last 7 days from known contacts that
    // aren't attached to any project yet.
    const noProject = await db.interaction.findMany({
      where: { type: "SMS", contactId: { not: null }, projectId: null, occurredAt: { gte: sevenDaysAgo() } },
      orderBy: { occurredAt: "desc" },
      include: { ...include, contact: { select: { id: true, firstName: true, lastName: true, company: true } } },
    });
    const contacts = await db.contact.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, company: true, email: true },
    });
    const projects = await db.project.findMany({ orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, contactId: true } });
    const phases = await db.projectPhase.findMany({ orderBy: [{ projectId: "asc" }, { order: "asc" }], take: 1000, select: { id: true, name: true, projectId: true } });
    const tasks = await db.task.findMany({
      where: { status: { not: "DONE" } },
      orderBy: { title: "asc" },
      take: 500,
      select: { id: true, title: true, projectId: true, phaseId: true },
    });
    const twilioReady = Boolean(await getTwilioConfig(db));
    const hour12 = await getHour12(session, db);
    return { unlinked, fresh, noProject, contacts, projects, phases, tasks, twilioReady, hour12 };
  });

  const toEntry = (i: (typeof unlinked)[number]): CallsSmsEntry => ({
    id: i.id,
    type: i.type,
    subject: i.subject,
    notes: i.notes,
    occurredAt: i.occurredAt.toISOString(),
    durationMinutes: i.durationMinutes,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    createdBy: i.loggedBy?.name ?? null,
    updatedBy: i.updatedBy?.name ?? null,
    contactId: i.contactId,
    projectId: i.projectId,
    phaseId: i.phaseId,
    taskId: i.taskId,
    participants: [],
    direction: i.direction,
    deliveryStatus: i.deliveryStatus,
    externalNumber: i.externalNumber,
    errorCode: i.errorCode,
    seenAt: i.seenAt ? i.seenAt.toISOString() : null,
  });

  // One row per unknown number, with all of its texts.
  const groups = new Map<string, UnlinkedGroup>();
  for (const text of unlinked) {
    const number = text.externalNumber ?? "?";
    const group = groups.get(number) ?? { number, texts: [] };
    group.texts.push({ id: text.id, text: text.notes, receivedAt: text.occurredAt.toISOString(), entry: toEntry(text) });
    groups.set(number, group);
  }

  const newTexts: NewText[] = fresh.map((i) => ({
    id: i.id,
    contactId: i.contact?.id ?? "",
    contactName: [i.contact?.firstName, i.contact?.lastName].filter(Boolean).join(" ") || i.contact?.company || "—",
    text: i.notes,
    receivedAt: i.occurredAt.toISOString(),
    entry: toEntry(i),
  }));

  const noProjectTexts: NewText[] = noProject.map((i) => ({
    id: i.id,
    contactId: i.contact?.id ?? "",
    contactName: [i.contact?.firstName, i.contact?.lastName].filter(Boolean).join(" ") || i.contact?.company || "—",
    text: i.notes,
    receivedAt: i.occurredAt.toISOString(),
    entry: toEntry(i),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <SmsIcon />
            <span className="truncate">{t.nav.sms}</span>
          </span>
        }
        hour12={hour12} lang={lang} location={t.dashboard.myLocation} />
      <p className="text-sm text-soft">{t.smsPage.subtitle}</p>
      <SmsInbox
        unlinked={[...groups.values()]}
        newTexts={newTexts}
        noProjectTexts={noProjectTexts}
        contacts={contacts.map((c) => ({
          id: c.id,
          label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || "—",
        }))}
        linkData={{
          projects: projects.map((p) => ({ id: p.id, name: p.name, contactId: p.contactId })),
          phases: phases.map((ph) => ({ id: ph.id, name: ph.name, projectId: ph.projectId })),
          tasks: tasks.map((tk) => ({ id: tk.id, name: tk.title, projectId: tk.projectId, phaseId: tk.phaseId })),
        }}
        twilioReady={twilioReady}
        currentUserId={session?.user.id ?? null}
        lang={lang}
      />
    </div>
  );
}
