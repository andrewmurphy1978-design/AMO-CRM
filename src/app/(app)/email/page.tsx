import Link from "next/link";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken, getRecentEmails, type EmailSummary } from "@/lib/google";
import { isOwnDomainEmail } from "@/lib/email-domain";
import { getEmailClassifications, type EmailCategory } from "@/lib/email-classifier";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "../page-header";
import EmailLinkPicker, { type LinkOption } from "./email-link-picker";
import EmailTime from "./email-time";
import EmailQuickActions from "../email-quick-actions";
import type { LinkDialogLabels } from "../link-dialog";

function contactLabel(c: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email;
}

// Order matters: most actionable first, least important last — mirrors
// how the Dashboard's own daily brief prioritizes things.
const CATEGORY_ORDER: EmailCategory[] = ["NEEDS_REPLY", "NEEDS_ATTENTION", "CAN_WAIT", "LOW_PRIORITY"];

interface EmailLinkInfo {
  contactId: string | null;
  projectId: string | null;
  taskId: string | null;
  summary: string | null;
}

function EmailRow({
  email,
  index,
  link,
  contactOptions,
  projectOptions,
  taskOptions,
  linkLabels,
  quickActionLabels,
  hour12,
  intlLocale,
}: {
  email: EmailSummary;
  index: number;
  link: EmailLinkInfo | undefined;
  contactOptions: LinkOption[];
  projectOptions: LinkOption[];
  taskOptions: LinkOption[];
  linkLabels: LinkDialogLabels;
  quickActionLabels: { reply: string; replyAll: string; forward: string };
  hour12: boolean;
  intlLocale: string;
}) {
  return (
    <li className={isOwnDomainEmail(email.fromEmail) ? "bg-amo-gold/20" : index % 2 === 1 ? "bg-black/[0.03]" : ""}>
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
          summary={link?.summary ?? null}
          labels={linkLabels}
        />
        <EmailQuickActions link={email.link} labels={quickActionLabels} />
        <span className="shrink-0 whitespace-nowrap text-xs text-soft">
          <EmailTime iso={email.date} hour12={hour12} intlLocale={intlLocale} />
        </span>
      </div>
    </li>
  );
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
  // Second shared client — the link lookup and the (Claude-backed)
  // classification lookup, sharing one connection rather than each
  // opening its own.
  const { linksByThread, classifications } = await withScopedPrismaClient(async (db) => {
    const emailLinks =
      threadIds.length > 0
        ? await db.emailLink.findMany({
            where: { gmailThreadId: { in: threadIds } },
            include: { contact: true, project: true, task: true },
          })
        : [];
    const linksByThread = new Map(emailLinks.map((l) => [l.gmailThreadId, l]));
    const classifications = emails ? await getEmailClassifications(db, emails) : {};
    return { linksByThread, classifications };
  });

  const contactOptions = contacts.map((c) => ({ id: c.id, label: contactLabel(c) }));
  const projectOptions = projects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId }));
  const taskOptions = tasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId }));

  const linkLabels: LinkDialogLabels = {
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

  const quickActionLabels = { reply: t.dashboard.emailReply, replyAll: t.dashboard.emailReplyAll, forward: t.dashboard.emailForward };

  const categoryLabels: Record<EmailCategory, string> = {
    NEEDS_REPLY: t.email.categoryNeedsReply,
    NEEDS_ATTENTION: t.email.categoryNeedsAttention,
    CAN_WAIT: t.email.categoryCanWait,
    LOW_PRIORITY: t.email.categoryLowPriority,
  };

  function linkInfoFor(email: EmailSummary): EmailLinkInfo | undefined {
    const link = linksByThread.get(email.threadId);
    if (!link) return undefined;
    const label = link.contact ? contactLabel(link.contact) : link.project ? link.project.name : link.task ? link.task.title : null;
    return { contactId: link.contactId, projectId: link.projectId, taskId: link.taskId, summary: label ? t.linkPicker.linkedTo(label) : null };
  }

  const groups: { category: EmailCategory; emails: EmailSummary[] }[] = CATEGORY_ORDER.map((category) => ({
    category,
    emails: (emails ?? []).filter((e) => classifications[e.id] === category),
  })).filter((g) => g.emails.length > 0);

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
        <div className="space-y-5">
          {groups.map(({ category, emails: groupEmails }) => (
            <section key={category}>
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
                {categoryLabels[category]} <span className="font-normal normal-case text-soft/70">({groupEmails.length})</span>
              </h2>
              <div className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
                <ul>
                  {groupEmails.map((email, i) => (
                    <EmailRow
                      key={email.id}
                      email={email}
                      index={i}
                      link={linkInfoFor(email)}
                      contactOptions={contactOptions}
                      projectOptions={projectOptions}
                      taskOptions={taskOptions}
                      linkLabels={linkLabels}
                      quickActionLabels={quickActionLabels}
                      hour12={hour12}
                      intlLocale={intlLocale}
                    />
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
