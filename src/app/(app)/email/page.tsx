import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/google";
import { getCachedInbox, getScreeningExtras, type EmailScreeningPayload } from "@/lib/email-inbox";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import EmailScreeningView from "./email-screening-view";
import { GmailIcon, IonosIcon } from "./mail-brand-icons";

function contactLabel(c: { firstName: string | null; lastName: string | null; email: string | null }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email || "";
}

export default async function EmailPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  // One shared client — reads the last-fetched inbox snapshot straight
  // from the DB (see EmailInboxCache) instead of hitting Gmail on every
  // page load; only the client-side Refresh button (or a first-ever visit
  // with no cache row yet) spends a live Gmail/Claude call, via
  // /api/email/inbox.
  const { connected, hour12, contacts, projects, tasks, affiliatePrograms, addressColors, initialData, composePrefs } = await withScopedPrismaClient(
    async (db) => {
      const accessToken = session ? await getValidAccessToken(session.user.id, db) : null;
      const hour12 = await getHour12(session, db);
      const composePrefs = session
        ? await db.user.findUnique({
            where: { id: session.user.id },
            select: { defaultComposeSource: true, defaultFontFamily: true, defaultFontSize: true },
          })
        : null;
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
      const affiliatePrograms = await db.affiliateProgram.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      const addressColors = await db.emailAddressColor.findMany({ orderBy: { order: "asc" } });

      let initialData: EmailScreeningPayload | null = null;
      if (accessToken && session) {
        const snapshot = await getCachedInbox(db, session.user.id);
        if (snapshot) {
          const extras = await getScreeningExtras(db, snapshot, session.user.id);
          initialData = { ...snapshot, ...extras };
        }
      }

      return { connected: accessToken !== null, hour12, contacts, projects, tasks, affiliatePrograms, addressColors, initialData, composePrefs };
    }
  );

  const contactOptions = contacts.map((c) => ({ id: c.id, label: contactLabel(c) }));
  const projectOptions = projects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId }));
  const taskOptions = tasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId }));
  const programOptions = affiliatePrograms.map((p) => ({ id: p.id, label: p.name }));

  return (
    <EmailScreeningView
      initialData={initialData}
      connected={connected}
      contactOptions={contactOptions}
      projectOptions={projectOptions}
      taskOptions={taskOptions}
      programOptions={programOptions}
      addressColors={addressColors}
      hour12={hour12}
      lang={lang}
      title={t.email.title}
      dateLocale={dateLocale}
      location={t.dashboard.myLocation}
      defaultComposeSource={composePrefs?.defaultComposeSource ?? null}
      defaultFontFamily={composePrefs?.defaultFontFamily ?? null}
      defaultFontSize={composePrefs?.defaultFontSize ?? null}
      headerActions={
        <>
          <a
            href="https://mail.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm sm:text-sm"
          >
            <GmailIcon className="h-4 w-4 shrink-0" />
            {t.dashboard.openInGmail}
          </a>
          <a
            href="https://mail.ionos.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm sm:text-sm"
          >
            <IonosIcon className="h-4 w-4 shrink-0" />
            {t.dashboard.openIonosWebmail}
          </a>
        </>
      }
    />
  );
}
