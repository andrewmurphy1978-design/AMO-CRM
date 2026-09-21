import { getUpcomingEvents } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getResolvedEventLinks } from "@/lib/calendar-links";
import { getDict } from "@/lib/i18n/dictionaries";
import CalendarCard, { type CalendarLabels } from "./calendar-card";
import type { LinkDialogLabels } from "./link-dialog";

function contactLabel(c: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email;
}

// `accessToken` is resolved once, sequentially, by the caller — see the
// comment on getUpcomingEvents in src/lib/google.ts for why this can't
// fetch it itself.
export default async function CalendarCardServer({
  accessToken,
  lang,
  hour12,
  labels,
}: {
  accessToken: string | null;
  lang: "en" | "fr";
  hour12: boolean;
  labels: CalendarLabels;
}) {
  const events = accessToken ? await getUpcomingEvents(accessToken) : null;

  // One shared client for the link lookup and the contact/project/task
  // option lists the link-editing dialog needs — see the comment on the
  // equivalent block in src/app/(app)/page.tsx for why these share a
  // connection instead of each opening its own.
  const { links, contactOptions, projectOptions, taskOptions } = await withScopedPrismaClient(async (db) => {
    const links = events && events.length > 0 ? await getResolvedEventLinks(db, events.map((e) => e.id)) : {};
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
    return {
      links,
      contactOptions: contacts.map((c) => ({ id: c.id, label: contactLabel(c) })),
      projectOptions: projects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId })),
      taskOptions: tasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId })),
    };
  });

  const t = getDict(lang);
  const linkDialogLabels: LinkDialogLabels = {
    link: t.linkPicker.link,
    edit: t.linkPicker.edit,
    none: t.linkPicker.none,
    contact: t.linkPicker.contact,
    project: t.linkPicker.project,
    task: t.linkPicker.task,
    booking: t.linkPicker.booking,
    affiliateProgram: t.linkPicker.affiliateProgram,
    save: t.linkPicker.save,
    saving: t.linkPicker.saving,
    cancel: t.linkPicker.cancel,
    clear: t.linkPicker.clear,
    title: t.linkPicker.title,
    searchPlaceholder: t.linkPicker.searchPlaceholder,
    noResults: t.linkPicker.noResults,
  };

  return (
    <CalendarCard
      initial={events}
      links={links}
      connected={accessToken !== null}
      lang={lang}
      hour12={hour12}
      labels={labels}
      contactOptions={contactOptions}
      projectOptions={projectOptions}
      taskOptions={taskOptions}
      linkDialogLabels={linkDialogLabels}
    />
  );
}
