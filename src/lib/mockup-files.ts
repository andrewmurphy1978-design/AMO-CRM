import type { PrismaClient } from "@/lib/prisma";
import { readZip } from "@/lib/zip-read";
import { onTaskDone } from "@/lib/task-schedule";
import { syncProjectLifecycle } from "@/lib/project-progress";

const PHASE = /(^|—\s*)mock-?up$/i;
const TYPES = ["website", "funnel", "blog", "app"];

export interface MockupResult {
  sections: string[]; // mock-up types found in the report
  verified: string[]; // tasks ticked
}

// Which mock-ups an AI report covers: one "# Website mock-up" (Funnel, Blog, App) heading each, with some content.
export function mockupSections(md: string): string[] {
  const parts = md.split(/^(?=#{1,2}\s)/m);
  const found: string[] = [];
  for (const part of parts) {
    const m = /^#{1,2}\s+(website|funnel|blog|app)\b[^\n]*mock-?up/i.exec(part);
    if (m && part.length > 200 && !found.includes(m[1].toLowerCase())) found.push(m[1].toLowerCase());
  }
  return found;
}

// Ticks the "Build the <Type> mock-up" tasks (or the single "Build mock-up") that the files cover.
export async function tickMockupTasks(db: PrismaClient, projectId: string, covered: string[]): Promise<string[]> {
  if (covered.length === 0) return [];
  const verified: string[] = [];
  const phases = await db.projectPhase.findMany({ where: { projectId }, select: { name: true, tasks: { select: { id: true, title: true, status: true } } } });
  for (const phase of phases.filter((p) => PHASE.test(p.name.trim()))) {
    for (const task of phase.tasks) {
      const m = /^build (?:the (\w+) )?mock-?up$/i.exec(task.title.trim());
      if (!m || task.status === "DONE") continue;
      const type = m[1]?.toLowerCase();
      if (type && !covered.includes(type)) continue;
      await db.task.update({ where: { id: task.id }, data: { status: "DONE", completedAt: new Date() } });
      await onTaskDone(db, task.id);
      verified.push(task.title);
    }
  }
  if (verified.length > 0) await syncProjectLifecycle(db, projectId);
  return verified;
}

export async function processMockupReport(db: PrismaClient, projectId: string, md: string): Promise<MockupResult> {
  const sections = mockupSections(md);
  return { sections, verified: await tickMockupTasks(db, projectId, sections) };
}

// The images of the AI's mock-up zip (PNG / JPG), kept one by one as "<folder>/<file>".
export async function importMockupZip(db: PrismaClient, projectId: string, zip: Uint8Array): Promise<{ added: number; skipped: string[]; types: string[] }> {
  const { entries, skipped } = await readZip(zip);
  const existing = new Set((await db.attachedFile.findMany({ where: { projectId, kind: "MOCKUP_SHOT" }, select: { name: true } })).map((f) => f.name.toLowerCase()));
  const types = new Set<string>();
  let added = 0;
  for (const e of entries) {
    const ext = (e.name.split(".").pop() ?? "").toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : null;
    if (!mime) continue;
    if (e.data.length > 900_000) {
      skipped.push(`${e.name} (over 900 KB)`);
      continue;
    }
    if (added >= 60) {
      skipped.push(`${e.name} (more than 60 images)`);
      continue;
    }
    const segs = e.name.split("/").filter(Boolean);
    const file = segs.pop() ?? e.name;
    const folder = (segs.reverse().find((s) => TYPES.includes(s.toLowerCase())) ?? segs[0] ?? "").toLowerCase();
    if (TYPES.includes(folder)) types.add(folder);
    const name = (folder ? `${folder}/${file}` : file).slice(0, 160);
    if (existing.has(name.toLowerCase())) continue;
    existing.add(name.toLowerCase());
    await db.attachedFile.create({ data: { projectId, kind: "MOCKUP_SHOT", name, mimeType: mime, size: e.data.length, data: e.data as never, uploadedByName: "AI mock-ups" } });
    added++;
  }
  return { added, skipped, types: [...types] };
}
