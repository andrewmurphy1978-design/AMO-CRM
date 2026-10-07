import type { PrismaClient } from "@/lib/prisma";

// The Brand and Research files that go into the Mock-up phase's input zip.
export interface InputFile {
  name: string;
  data: Uint8Array;
}

const safe = (n: string) => n.replace(/[^\w.() -]+/g, "-").slice(0, 120);

export async function mockupInputFiles(db: PrismaClient, projectId: string, contactId: string, withData: boolean): Promise<InputFile[]> {
  const sel = { id: true, kind: true, name: true, ...(withData ? { data: true } : {}) } as const;
  const brand = await db.attachedFile.findMany({ where: { contactId, kind: { in: ["BRAND_REPORT", "BRAND_PDF"] } }, orderBy: { createdAt: "asc" }, select: sel });
  const research = await db.attachedFile.findMany({ where: { projectId, kind: { in: ["RESEARCH_REPORT", "RESEARCH_PDF"] } }, orderBy: { createdAt: "asc" }, select: sel });
  const shots = await db.attachedFile.findMany({ where: { projectId, kind: "RESEARCH_SHOT" }, orderBy: { createdAt: "asc" }, take: 24, select: sel });
  const bytes = (f: { data?: unknown }) => (f.data ? new Uint8Array(f.data as Uint8Array) : new Uint8Array());
  const used = new Set<string>();
  const add = (folder: string, f: { name: string; data?: unknown }): InputFile => {
    let name = `${folder}/${safe(f.name)}`;
    for (let n = 2; used.has(name); n++) name = `${folder}/${n}-${safe(f.name)}`;
    used.add(name);
    return { name, data: bytes(f) };
  };
  return [...brand.map((f) => add("brand/reports", f)), ...research.map((f) => add("research/reports", f)), ...shots.map((f) => add("research/screenshots", f))];
}
