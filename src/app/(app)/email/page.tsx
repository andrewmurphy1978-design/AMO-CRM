import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma, withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken, getRecentEmails } from "@/lib/google";
import { isOwnDomainEmail } from "@/lib/email-domain";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "../page-header";
import EmailLinkPicker from "./email-link-picker";
import EmailTime from "./email-time";
import EmailQuickActions from "../email-quick-actions";

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
    const projects = await db.project.findMany({
      orderBy: { name: "asc" },
      take: 300,
      select: { id: true, name: true, contactId: true },
    });
    const tasks = await db.task.findMany({
      where: { status: { not: "DONE" } },
      orderBy: { title: "asc" },
      take: 300,
      select: { id: true, title: true, projectId: true },
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
  const projectOptions = projects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId }));
  const taskOptions = tasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId }));

  const linkLabels = {
    link: t.linkPicker.link,
    edit: t.linkPicker.edit,
    none: t.linkPicker.none,
    contact: t.linkPicker.contact,
    project: t.linkPicker.project,
    task: t.linkPicker.task,
    booking: t.linkPicker.booking,
    save: t.linkPicker.save,
    saving: t.linkPicker.saving,
    cancel: t.linkPicker.cancel,
    clear: t.linkPicker.clear,
    title: t.linkPicker.title,
    searchPlaceholder: t.linkPicker.searchPlaceholder,
    noResults: t.linkPicker.noResults,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.email.title}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={
          <>
            <a
              href="https://mail.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm sm:text-sm"
            >
              {t.dashboard.openInGmail}
            </a>
            <a
              href="https://mail.ionos.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm sm:text-sm"
            >
              {t.dashboard.openIonosWebmail}
            </a>
          </>
        }
      />
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
                <li key={email.id} className={isOwnDomainEmail(email.fromEmail) ? "bg-amo-gold/20" : i % 2 === 1 ? "bg-black/[0.03]" : ""}>
                  <div className="flex items-center gap-3 px-4 py-1.5">
                    <a
                      href={email.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-40 shrink-0 truncate text-sm font-medium text-ink hover:opacity-80"
                    >
                      {email.from}
                    </a>
                    <a
                      href={email.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-sm text-soft hover:opacity-80"
                    >
                      {email.subject}
                    </a>
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
                    <EmailQuickActions
                      link={email.link}
                      labels={{ reply: t.dashboard.emailReply, replyAll: t.dashboard.emailReplyAll, forward: t.dashboard.emailForward }}
                    />
                    <span className="shrink-0 whitespace-nowrap text-xs text-soft">
                      <EmailTime iso={email.date} hour12={hour12} intlLocale={intlLocale} />
                    </span>
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
