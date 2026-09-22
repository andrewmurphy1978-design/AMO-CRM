import { notFound } from "next/navigation";
import { withScopedPrismaClient } from "@/lib/prisma";
import { updateProject } from "@/actions/projects";
import { auth } from "@/lib/auth";
import { getHour12 } from "@/lib/time-format";
import ProjectForm from "../../project-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";

function toDateInput(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  // One shared client — see src/lib/prisma.ts for why.
  const { project, contacts, users, hour12 } = await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({
      where: { id },
      include: {
        teamMembers: true,
        phases: { orderBy: { order: "asc" } },
      },
    });
    const contacts = await db.contact.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    const users = await db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    const hour12 = await getHour12(session, db);
    return { project, contacts, users, hour12 };
  });

  if (!project) notFound();

  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const boundUpdate = updateProject.bind(null, project.id);

  return (
    <ProjectForm
      action={boundUpdate}
      defaultValues={{
        ...project,
        phases: project.phases.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          phaseType: p.phaseType,
          teamMemberIds: p.teamMemberIds,
          startDate: toDateInput(p.startDate),
          dueDate: toDateInput(p.dueDate),
          description: p.description,
        })),
      }}
      submitLabel={t.projectForm.saveChanges}
      lang={lang}
      title={t.editProjectPage.title}
      hour12={hour12}
      dateLocale={dateLocale}
      location={t.dashboard.myLocation}
      contacts={contacts.map((c) => ({
        id: c.id,
        label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
      }))}
      users={users}
    />
  );
}
