import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { taskWho } from "@/lib/task-schedule";

// GET /api/admin/apply-task-people: gives every task that is not completed the supervisor and the team members of
// its project (supervisor = the project's supervisor, else its owner; assignees = the project's team members).
// A project with no supervisor/owner or no team keeps what its tasks already have for that part. Safe to run again.
export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.user.role !== "ADMIN") return new Response("Admins only", { status: 403 });
  const result = await withScopedPrismaClient(async (db) => {
    const projects = await db.project.findMany({ select: { id: true, name: true } });
    const out: { project: string; tasks: number }[] = [];
    for (const p of projects) {
      const who = await taskWho(db, p.id);
      const data = {
        ...(who.supervisorId ? { supervisorId: who.supervisorId } : {}),
        ...(who.assigneeIds.length > 0 ? { assigneeIds: who.assigneeIds, assigneeId: who.assigneeIds[0] } : {}),
      };
      if (Object.keys(data).length === 0) continue;
      const r = await db.task.updateMany({ where: { projectId: p.id, status: { not: "DONE" } }, data });
      if (r.count > 0) out.push({ project: p.name, tasks: r.count });
    }
    return out;
  });
  return Response.json({ updatedProjects: result.length, updatedTasks: result.reduce((n, r) => n + r.tasks, 0), details: result });
}
