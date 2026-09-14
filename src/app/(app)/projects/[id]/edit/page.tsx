import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateProject } from "@/actions/projects";
import ProjectForm from "../../project-form";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project, contacts, users] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.contact.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!project) notFound();

  const boundUpdate = updateProject.bind(null, project.id);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Edit project</h1>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <ProjectForm
          action={boundUpdate}
          defaultValues={project}
          submitLabel="Save changes"
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
