import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/google";
import { publicBaseUrl } from "@/lib/twilio";

// Two-way sync between CRM tasks and Google Tasks, per user:
//  - only tasks assigned to that user are mirrored, into a Google Tasks list
//    named "AMO CRM" in their own Google account (visible in the Google
//    Tasks / Calendar apps on their phone);
//  - title, notes, due date and done/not-done travel both ways; whichever
//    side changed since the last sync wins (the later change if both did);
//  - tasks created in Google are not imported (a CRM task needs a project),
//    and a task deleted in Google stays in the CRM but is not pushed again.
// Google Tasks stores a due DATE only, and has no priority or assignee.

const API = "https://tasks.googleapis.com/tasks/v1";
const LIST_TITLE = "AMO CRM";
const FOOTER_PATTERN = /\n*— AMO CRM[\s\S]*$/;

interface GoogleTask {
  id: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: "needsAction" | "completed";
  updated?: string;
}

type Result<T> = ({ ok: true } & T) | { error: string };

async function google(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

// Turns a failed Google Tasks response into an instruction that fits the
// actual cause: the API not being switched on in the Google Cloud project,
// or the connection lacking the Tasks permission (an older connection made
// before it was requested).
async function explain(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  if (/accessNotConfigured|has not been used|is disabled|SERVICE_DISABLED/i.test(body)) {
    return "The Google Tasks API isn't switched on in your Google Cloud project. In Google Cloud Console open APIs & Services > Library, search for \"Google Tasks API\", click Enable, then try again.";
  }
  if (res.status === 401 || res.status === 403) {
    return "Google didn't allow access to Tasks. In Settings, click Disconnect and then Connect under Google integration, and approve the Tasks permission.";
  }
  return `Google Tasks returned ${res.status}.`;
}

// Finds (or creates) the "AMO CRM" list and remembers its id on the user's
// Google connection — that saved id is what "sync is on" means.
export async function enableGoogleTasks(db: PrismaClient, userId: string): Promise<Result<object>> {
  const token = await getValidAccessToken(userId, db);
  if (!token) return { error: "Google isn't connected (or the connection has expired). Disconnect and connect it again in Settings." };

  const listRes = await google(token, "/users/@me/lists?maxResults=100");
  if (!listRes.ok) return { error: await explain(listRes) };
  const lists = ((await listRes.json()) as { items?: { id: string; title: string }[] }).items ?? [];
  let listId = lists.find((l) => l.title === LIST_TITLE)?.id;
  if (!listId) {
    const created = await google(token, "/users/@me/lists", { method: "POST", body: JSON.stringify({ title: LIST_TITLE }) });
    if (!created.ok) return { error: await explain(created) };
    listId = ((await created.json()) as { id: string }).id;
  }
  await db.googleAccount.update({ where: { userId }, data: { tasksListId: listId } });
  return { ok: true };
}

// Stops syncing. The tasks already in Google are left where they are.
export async function disableGoogleTasks(db: PrismaClient, userId: string): Promise<void> {
  await db.googleAccount.updateMany({ where: { userId }, data: { tasksListId: null } });
  await db.googleTaskLink.deleteMany({ where: { userId } });
}

function dueFor(dueDate: Date | null): string | undefined {
  return dueDate ? `${dueDate.toISOString().slice(0, 10)}T00:00:00.000Z` : undefined;
}

function notesFor(description: string | null, projectName: string, taskId: string): string {
  const base = publicBaseUrl();
  return `${description ?? ""}\n\n— AMO CRM · ${projectName}${base ? `\n${base}/tasks/${taskId}` : ""}`.trim();
}

function stripFooter(notes: string | undefined): string | null {
  const text = (notes ?? "").replace(FOOTER_PATTERN, "").trim();
  return text || null;
}

interface SyncCounts {
  pushed: number;
  pulled: number;
  removed: number;
}

export async function syncUserTasks(db: PrismaClient, userId: string): Promise<Result<SyncCounts>> {
  const account = await db.googleAccount.findUnique({ where: { userId }, select: { tasksListId: true } });
  const listId = account?.tasksListId;
  if (!listId) return { error: "Google Tasks sync isn't turned on." };
  const token = await getValidAccessToken(userId, db);
  if (!token) return { error: "Google isn't connected (or the connection has expired)." };

  // Everything currently in the Google list, by id.
  const remote = new Map<string, GoogleTask>();
  let pageToken: string | undefined;
  do {
    const res = await google(token, `/lists/${listId}/tasks?showCompleted=true&showHidden=true&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`);
    if (!res.ok) return { error: await explain(res) };
    const data = (await res.json()) as { items?: GoogleTask[]; nextPageToken?: string };
    for (const item of data.items ?? []) remote.set(item.id, item);
    pageToken = data.nextPageToken;
  } while (pageToken);

  const tasks = await db.task.findMany({
    where: { OR: [{ assigneeId: userId, NOT: { status: "DONE" } }, { googleTaskLink: { userId } }] },
    include: { project: { select: { name: true } }, googleTaskLink: true },
  });

  const counts: SyncCounts = { pushed: 0, pulled: 0, removed: 0 };

  for (const task of tasks) {
    try {
      const link = task.googleTaskLink && task.googleTaskLink.userId === userId ? task.googleTaskLink : null;

      // No longer this user's task (reassigned): take it out of their Google list.
      if (link && task.assigneeId !== userId) {
        await google(token, `/lists/${listId}/tasks/${link.googleTaskId}`, { method: "DELETE" });
        await db.googleTaskLink.delete({ where: { id: link.id } });
        counts.removed += 1;
        continue;
      }
      if (task.assigneeId !== userId) continue;
      if (link?.googleDeleted) continue;

      const desired = {
        title: task.title,
        notes: notesFor(task.description, task.project.name, task.id),
        due: dueFor(task.dueDate),
        status: task.status === "DONE" ? ("completed" as const) : ("needsAction" as const),
      };

      // Never mirrored yet: create it in Google.
      if (!link) {
        const res = await google(token, `/lists/${listId}/tasks`, {
          method: "POST",
          body: JSON.stringify({ title: desired.title, notes: desired.notes, ...(desired.due ? { due: desired.due } : {}), status: desired.status }),
        });
        if (!res.ok) continue;
        const created = (await res.json()) as GoogleTask;
        await db.googleTaskLink.upsert({
          where: { taskId: task.id },
          update: { userId, googleTaskId: created.id, googleDeleted: false, lastSyncedAt: new Date() },
          create: { taskId: task.id, userId, googleTaskId: created.id },
        });
        counts.pushed += 1;
        continue;
      }

      const g = remote.get(link.googleTaskId);
      if (!g) {
        // Deleted on the Google side: keep the CRM task, stop mirroring it.
        await db.googleTaskLink.update({ where: { id: link.id }, data: { googleDeleted: true } });
        continue;
      }

      const crmChanged = task.updatedAt.getTime() > link.lastSyncedAt.getTime();
      const googleChanged = g.updated ? new Date(g.updated).getTime() > link.lastSyncedAt.getTime() : false;
      const same =
        (g.title ?? "") === desired.title &&
        (g.notes ?? "") === desired.notes &&
        (g.due ?? "").slice(0, 10) === (desired.due ?? "").slice(0, 10) &&
        (g.status ?? "needsAction") === desired.status;

      const pullWins = googleChanged && (!crmChanged || new Date(g.updated as string).getTime() > task.updatedAt.getTime());

      if (!same && pullWins) {
        const gDone = g.status === "completed";
        await db.task.update({
          where: { id: task.id },
          data: {
            title: g.title?.trim() || task.title,
            description: stripFooter(g.notes),
            dueDate: g.due ? new Date(g.due) : null,
            ...(gDone && task.status !== "DONE" ? { status: "DONE", completedAt: new Date() } : {}),
            ...(!gDone && task.status === "DONE" ? { status: "TODO", completedAt: null } : {}),
          },
        });
        counts.pulled += 1;
      } else if (!same && crmChanged) {
        await google(token, `/lists/${listId}/tasks/${link.googleTaskId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: desired.title,
            notes: desired.notes,
            due: desired.due ?? null,
            status: desired.status,
            ...(desired.status === "needsAction" ? { completed: null } : {}),
          }),
        });
        counts.pushed += 1;
      }
      await db.googleTaskLink.update({ where: { id: link.id }, data: { lastSyncedAt: new Date() } });
    } catch {
      // One bad task shouldn't stop the rest from syncing.
    }
  }

  return { ok: true, ...counts };
}

// Runs a sync for everyone who has it on — called by the periodic job.
export async function syncAllGoogleTasks(): Promise<void> {
  const users = await withScopedPrismaClient((db) =>
    db.googleAccount.findMany({ where: { tasksListId: { not: null } }, select: { userId: true } })
  );
  for (const { userId } of users) {
    await withScopedPrismaClient((db) => syncUserTasks(db, userId)).catch(() => undefined);
  }
}

// After a task is created/edited/completed in the CRM: push it (and pick up
// anything changed in Google) for whoever it belongs to now, and whoever it
// belonged to before if it was reassigned. Best effort — never blocks or
// fails the CRM action that triggered it.
export async function syncGoogleTasksForTask(taskId: string): Promise<void> {
  try {
    await withScopedPrismaClient(async (db) => {
      const task = await db.task.findUnique({
        where: { id: taskId },
        select: { assigneeId: true, googleTaskLink: { select: { userId: true } } },
      });
      const users = new Set([task?.assigneeId, task?.googleTaskLink?.userId].filter((u): u is string => Boolean(u)));
      for (const userId of users) {
        const account = await db.googleAccount.findUnique({ where: { userId }, select: { tasksListId: true } });
        if (account?.tasksListId) await syncUserTasks(db, userId);
      }
    });
  } catch {
    // ignore
  }
}

// Before a CRM task is deleted: remove its Google copy too (once the CRM row
// is gone the link that says where it lives goes with it).
export async function removeTaskFromGoogle(taskId: string): Promise<void> {
  try {
    await withScopedPrismaClient(async (db) => {
      const link = await db.googleTaskLink.findUnique({ where: { taskId } });
      if (!link) return;
      const account = await db.googleAccount.findUnique({ where: { userId: link.userId }, select: { tasksListId: true } });
      const token = account?.tasksListId ? await getValidAccessToken(link.userId, db) : null;
      if (token && account?.tasksListId) {
        await google(token, `/lists/${account.tasksListId}/tasks/${link.googleTaskId}`, { method: "DELETE" });
      }
    });
  } catch {
    // ignore
  }
}
