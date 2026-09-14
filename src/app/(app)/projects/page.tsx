import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const STATUS_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  PLANNING: "bg-slate-100 text-slate-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  ON_HOLD: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const where: Prisma.ProjectWhereInput = {};
  if (status) where.status = status as Prisma.ProjectWhereInput["status"];

  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
      owner: true,
      tasks: { select: { status: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">{projects.length} shown</p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New project
        </Link>
      </div>

      <form className="flex gap-3" method="get">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Filter
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => {
          const doneCount = project.tasks.filter((t) => t.status === "DONE").length;
          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium text-slate-900">{project.name}</h2>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[project.status]}`}
                >
                  {STATUS_LABELS[project.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {[project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") ||
                  project.contact.email}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                {doneCount}/{project.tasks.length} tasks done
                {project.owner && ` · ${project.owner.name}`}
              </p>
            </Link>
          );
        })}
        {projects.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-slate-500">No projects found.</p>
        )}
      </div>
    </div>
  );
}
