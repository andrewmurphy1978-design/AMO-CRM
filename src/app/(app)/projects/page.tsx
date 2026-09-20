import Link from "next/link";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getHour12 } from "@/lib/time-format";
import PageHeader from "../page-header";

const STATUS_COLORS: Record<string, string> = {
  PLANNING: "bg-black/5 text-soft",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-sky-50 text-sky-700",
  CANCELLED: "bg-red-50 text-red-600",
};

// Short 1-2 letter initials for a team-member pill, e.g. "Andrew Murphy" -> "AM".
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function TeamAvatars({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-ink/70">—</span>;
  return (
    <div className="flex -space-x-1.5">
      {names.map((name) => (
        <span
          key={name}
          title={name}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card-bg bg-amo-lime/20 text-[10px] font-semibold text-emerald-700"
        >
          {initials(name)}
        </span>
      ))}
    </div>
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string }>;
}) {
  const { status, view } = await searchParams;
  const activeView = view === "table" ? "table" : "cards";
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const STATUS_LABELS = t.projectStatuses;

  const where: Prisma.ProjectWhereInput = {};
  if (status) where.status = status as Prisma.ProjectWhereInput["status"];

  // One shared client — see src/lib/prisma.ts for why.
  const { projects, hour12 } = await withScopedPrismaClient(async (db) => {
    const projects = await db.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        contact: true,
        owner: true,
        tasks: { select: { status: true } },
        phases: true,
        teamMembers: { include: { user: true } },
      },
    });
    const hour12 = await getHour12(session, db);
    return { projects, hour12 };
  });

  const viewHref = (v: "cards" | "table") => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (v !== "cards") params.set("view", v);
    const qs = params.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t.projects.title} hour12={hour12} dateLocale={dateLocale} location={t.dashboard.myLocation} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-soft">{t.projects.shown(projects.length)}</p>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-card-border text-sm font-medium">
            <Link
              href={viewHref("cards")}
              className={`px-3 py-1.5 ${activeView === "cards" ? "bg-amo-green text-white" : "bg-card-bg text-ink hover:bg-black/5"}`}
            >
              {t.projects.viewCards}
            </Link>
            <Link
              href={viewHref("table")}
              className={`px-3 py-1.5 ${activeView === "table" ? "bg-amo-green text-white" : "bg-card-bg text-ink hover:bg-black/5"}`}
            >
              {t.projects.viewTable}
            </Link>
          </div>
          <Link
            href="/projects/new"
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm"
          >
            {t.projects.newProject}
          </Link>
        </div>
      </div>

      <form className="flex gap-3" method="get">
        {activeView === "table" && <input type="hidden" name="view" value="table" />}
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        >
          <option value="">{t.projects.allStatuses}</option>
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
          {t.common.filter}
        </button>
      </form>

      {activeView === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const doneCount = project.tasks.filter((task) => task.status === "DONE").length;
            const progressPct = project.tasks.length > 0 ? Math.round((doneCount / project.tasks.length) * 100) : 0;
            const teamNames = project.teamMembers.map((tm) => tm.user.name);
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
                <p className="mt-2 text-xs text-soft">{t.projectTypes[project.type]}</p>

                {project.tasks.length > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                      <div className="h-full rounded-full amo-card-accent" style={{ width: `${progressPct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-soft">{t.projects.tasksDone(doneCount, project.tasks.length)}</p>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-soft">
                  <span>
                    {project.owner ? `${t.projectForm.owner}: ${project.owner.name}` : t.common.unassigned}
                    {project.phases.length > 0 && ` · ${project.phases.length} ${t.projects.colPhases.toLowerCase()}`}
                  </span>
                  {teamNames.length > 0 && <TeamAvatars names={teamNames} />}
                </div>

                {(project.startDate || project.dueDate) && (
                  <p className="mt-2 text-xs text-soft">
                    {project.startDate && `${t.projects.colStart}: ${format(project.startDate, "MMM d, yyyy", { locale: dateLocale })}`}
                    {project.startDate && project.dueDate && " · "}
                    {project.dueDate && `${t.projects.colDue}: ${format(project.dueDate, "MMM d, yyyy", { locale: dateLocale })}`}
                  </p>
                )}
              </Link>
            );
          })}
          {projects.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-soft">{t.projects.noProjectsFound}</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-card-border bg-card-bg shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-card-border bg-black/[0.02] text-left text-xs uppercase tracking-wide text-soft">
              <tr>
                <th className="px-4 py-3">{t.projects.colName}</th>
                <th className="px-4 py-3">{t.projects.colClient}</th>
                <th className="px-4 py-3">{t.projects.colType}</th>
                <th className="px-4 py-3">{t.projects.colStatus}</th>
                <th className="px-4 py-3">{t.projects.colOwner}</th>
                <th className="px-4 py-3">{t.projects.colTeam}</th>
                <th className="px-4 py-3">{t.projects.colTasks}</th>
                <th className="px-4 py-3">{t.projects.colStart}</th>
                <th className="px-4 py-3">{t.projects.colDue}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {projects.map((project, i) => {
                const doneCount = project.tasks.filter((task) => task.status === "DONE").length;
                const teamNames = project.teamMembers.map((tm) => tm.user.name);
                return (
                  <tr
                    key={project.id}
                    className="group relative"
                    style={{ backgroundColor: i % 2 === 0 ? "#f4faf6" : "#7fa898" }}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/projects/${project.id}`} className="relative z-10 font-medium text-ink group-hover:underline">
                        <span className="absolute inset-0 z-0 group-hover:bg-black/5" aria-hidden="true" />
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink/70">
                      {[project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") ||
                        project.contact.email}
                    </td>
                    <td className="px-4 py-3 text-ink/70">{t.projectTypes[project.type]}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[project.status]}`}>
                        {STATUS_LABELS[project.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{project.owner?.name ?? t.common.unassigned}</td>
                    <td className="px-4 py-3">
                      <TeamAvatars names={teamNames} />
                    </td>
                    <td className="px-4 py-3 text-ink/70">{t.projects.tasksDone(doneCount, project.tasks.length)}</td>
                    <td className="px-4 py-3 text-ink/70">
                      {project.startDate ? format(project.startDate, "MMM d, yyyy", { locale: dateLocale }) : t.projects.noDate}
                    </td>
                    <td className="px-4 py-3 text-ink/70">
                      {project.dueDate ? format(project.dueDate, "MMM d, yyyy", { locale: dateLocale }) : t.projects.noDate}
                    </td>
                  </tr>
                );
              })}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-soft">
                    {t.projects.noProjectsFound}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
