import { notFound } from "next/navigation";
import { withScopedPrismaClient } from "@/lib/prisma";
import { updateProject } from "@/actions/projects";
import ProjectForm from "../../project-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // One shared client — see src/lib/prisma.ts for why.
  const { project, contacts, users } = await withScopedPrismaClient(async (db) => {
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
    return { project, contacts, users };
  });

  if (!project) notFound();

  const lang = await getLang();
  const t = getDict(lang);
  const boundUpdate = updateProject.bind(null, project.id);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-ink">{t.editProjectPage.title}</h1>
      <div className="mt-6 rounded-lg border border-card-border bg-card-bg p-6 shadow-sm">
        <ProjectForm
          action={boundUpdate}
          defaultValues={project}
          submitLabel={t.projectForm.saveChanges}
          lang={lang}
          contacts={contacts.map((c) => ({
            id: c.id,
            label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
          }))}
          users={users}
        />
      </div>
    </div>
  );
}
