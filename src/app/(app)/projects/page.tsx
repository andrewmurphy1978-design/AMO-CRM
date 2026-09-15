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
  PLANNING: "bg-black/5 text-soft",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-sky-50 text-sky-700",
  CANCELLED: "bg-red-50 text-red-600",
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
          <h1 className="font-display text-2xl font-semibold text-ink">Projects</h1>
          <p className="mt-1 text-sm text-soft">{projects.length} shown</p>
        </div>
        <Link
          href="/projects/new"
          className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm"
        >
          New project
        </Link>
      </div>

      <form className="flex gap-3" method="get">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
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
          className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
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
              className="group relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-amo-lime/40 hover:shadow-[0_12px_28px_rgba(46,204,113,0.15)]"
            >
              <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display font-medium text-ink">{project.name}</h2>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[project.status]}`}
                >
                  {STATUS_LABELS[project.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-soft">
                {[project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") ||
                  project.contact.email}
              </p>
              <p className="mt-3 text-xs text-soft">
                {doneCount}/{project.tasks.length} tasks done
                {project.owner && ` · ${project.owner.name}`}
              </p>
            </Link>
          );
        })}
        {projects.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-soft">No projects found.</p>
        )}
      </div>
    </div>
  );
}
