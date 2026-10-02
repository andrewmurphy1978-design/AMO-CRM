import { withScopedPrismaClient } from "@/lib/prisma";
import { createProject } from "@/actions/projects";
import { auth } from "@/lib/auth";
import { getHour12 } from "@/lib/time-format";
import ProjectForm from "../project-form";
import { getLang } from "@/lib/i18n/get-lang";
import { loadTypeInfo } from "@/lib/project-type-store";

import { getDict } from "@/lib/i18n/dictionaries";
import { getAllProjectTemplates } from "@/lib/project-template-store";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const { contactId } = await searchParams;
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const { labels: typeLabels, customKeys: customTypeKeys } = await loadTypeInfo(lang);

  // One shared client — see src/lib/prisma.ts for why.
  const { contacts, users, hour12, templates } = await withScopedPrismaClient(async (db) => {
    const contacts = await db.contact.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    const users = await db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    const hour12 = await getHour12(session, db);
    const templates = await getAllProjectTemplates(db);
    return { contacts, users, hour12, templates };
  });

  return (
    <ProjectForm
      typeLabels={typeLabels}
      customTypeKeys={customTypeKeys}
      action={createProject}
      submitLabel={t.projectForm.createProject}
      defaultValues={{ contactId }}
      lang={lang}
      title={t.newProjectPage.title}
      hour12={hour12}
      location={t.dashboard.myLocation}
      contacts={contacts.map((c) => ({
        id: c.id,
        label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "",
      }))}
      users={users}
      templates={templates}
    />
  );
}
