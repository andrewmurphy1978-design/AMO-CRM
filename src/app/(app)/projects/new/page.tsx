import { prisma } from "@/lib/prisma";
import { createProject } from "@/actions/projects";
import ProjectForm from "../project-form";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const { contactId } = await searchParams;

  // Sequential, not Promise.all — see src/lib/prisma.ts for why.
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-amo-white">New project</h1>
      <div className="mt-6 rounded-lg border border-amo-border bg-amo-card p-6 shadow-sm">
        <ProjectForm
          action={createProject}
          submitLabel="Create project"
          defaultValues={{ contactId }}
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
