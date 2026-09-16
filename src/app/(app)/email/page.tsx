import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma, withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken, getRecentEmails } from "@/lib/google";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "../page-header";
import EmailLinkPicker from "./email-link-picker";

// Same reasoning as elsewhere in the app for the "today shows just the
// time" formatting, but using Intl directly (not date-fns' locale
// default) so it respects the user's own 24h/12h setting.
function formatEmailDate(iso: string, hour12: boolean, intlLocale: string): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(intlLocale, { hour: "numeric", minute: "2-digit", hour12 }).format(date);
  if (date.toDateString() === new Date().toDateString()) return time;
  const day = new Intl.DateTimeFormat(intlLocale, { month: "short", day: "numeric" }).format(date);
  return `${day}, ${time}`;
}

function contactLabel(c: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email;
}

export default async function EmailPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  // One shared client for the reads below — see the comment on the
  // equivalent block in src/app/(app)/page.tsx for why.
  const { googleAccessToken, hour12, contacts, projects, tasks } = await withScopedPrismaClient(async (db) => {
    const googleAccessToken = session ? await getValidAccessToken(session.user.id, db) : null;
    const hour12 = await getHour12(session, db);
    const contacts = await db.contact.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 300,
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const projects = await db.project.findMany({ orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } });
    const tasks = await db.task.findMany({
      where: { status: { not: "DONE" } },
      orderBy: { title: "asc" },
      take: 300,
      select: { id: true, title: true },
    });
    return { googleAccessToken, hour12, contacts, projects, tasks };
  });

  const emails = googleAccessToken ? await getRecentEmails(googleAccessToken, { maxResults: 30, unreadOnly: false }) : null;

  const threadIds = (emails ?? []).map((e) => e.threadId);
  const emailLinks =
    threadIds.length > 0
      ? await prisma.emailLink.findMany({
          where: { gmailThreadId: { in: threadIds } },
          include: { contact: true, project: true, task: true },
        })
      : [];
  const linksByThread = new Map(emailLinks.map((l) => [l.gmailThreadId, l]));

  const contactOptions = contacts.map((c) => ({ id: c.id, label: contactLabel(c) }));
  const projectOptions = projects.map((p) => ({ id: p.id, label: p.name }));
  const taskOptions = tasks.map((tk) => ({ id: tk.id, label: tk.title }));

  const linkLabels = {
    link: t.linkPicker.link,
    edit: t.linkPicker.edit,
    none: t.linkPicker.none,
    contact: t.linkPicker.contact,
    project: t.linkPicker.project,
    task: t.linkPicker.task,
    save: t.linkPicker.save,
    saving: t.linkPicker.saving,
    cancel: t.linkPicker.cancel,
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t.email.title} hour12={hour12} dateLocale={dateLocale} location={t.dashboard.myLocation} />
      <p className="text-sm text-soft">{t.email.subtitle}</p>

      {!googleAccessToken ? (
        <p className="text-sm text-soft">
          {t.email.notConnected}{" "}
          <Link href="/settings" className="font-semibold text-emerald-700 underline">
            {t.email.connectInSettings}
          </Link>
        </p>
      ) : !emails || emails.length === 0 ? (
        <p className="text-sm text-soft">{t.email.noMessages}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
          <ul>
            {emails.map((email, i) => {
              const link = linksByThread.get(email.threadId);
              const linkedLabel = link
                ? link.contact
                  ? contactLabel(link.contact)
                  : link.project
                    ? link.project.name
                    : link.task
                      ? link.task.title
                      : null
                : null;
              return (
                <li key={email.id} className={i % 2 === 1 ? "bg-black/[0.03]" : ""}>
                  <div className="flex items-start gap-2 px-4 py-2.5">
                    <a href={email.link} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:opacity-80">
                      <p className="truncate text-sm font-medium text-ink">{email.from}</p>
                      <p className="truncate text-xs text-soft">{email.subject}</p>
                    </a>
                    <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-soft">
                      {formatEmailDate(email.date, hour12, intlLocale)}
                    </span>
                  </div>
                  <div className="px-4 pb-2.5">
                    <EmailLinkPicker
                      threadId={email.threadId}
                      contacts={contactOptions}
                      projects={projectOptions}
                      tasks={taskOptions}
                      initialContactId={link?.contactId ?? ""}
                      initialProjectId={link?.projectId ?? ""}
                      initialTaskId={link?.taskId ?? ""}
                      summary={linkedLabel ? t.linkPicker.linkedTo(linkedLabel) : null}
                      labels={linkLabels}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
