import type { PrismaClient } from "@/lib/prisma";

// The Brand and Research files that go into the Mock-up phase's input zip.
export interface InputFile {
  name: string;
  data: Uint8Array;
}

const safe = (n: string) => n.replace(/[^\w.() -]+/g, "-").slice(0, 120);

export async function mockupInputFiles(db: PrismaClient, projectId: string, contactId: string, withData: boolean): Promise<InputFile[]> {
  // Only the Markdown reports and a few small screenshots: the PDF guides repeat the reports and are heavy (the
  // request has to stay light for the server's memory limit).
  const text = [{ name: { endsWith: ".md", mode: "insensitive" as const } }, { name: { endsWith: ".markdown", mode: "insensitive" as const } }, { name: { endsWith: ".txt", mode: "insensitive" as const } }];
  const brand = await db.attachedFile.findMany({ where: { contactId, kind: "BRAND_REPORT", OR: text }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const research = await db.attachedFile.findMany({ where: { projectId, kind: "RESEARCH_REPORT", OR: text }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const shots = await db.attachedFile.findMany({ where: { projectId, kind: "RESEARCH_SHOT", size: { lt: 600_000 } }, orderBy: { createdAt: "asc" }, take: 12, select: { id: true, name: true } });
  const used = new Set<string>();
  const out: InputFile[] = [];
  // One file at a time, so only one is in memory while it is read.
  for (const [folder, list] of [["brand/reports", brand], ["research/reports", research], ["research/screenshots", shots]] as const) {
    for (const f of list) {
      let name = `${folder}/${safe(f.name)}`;
      for (let n = 2; used.has(name); n++) name = `${folder}/${n}-${safe(f.name)}`;
      used.add(name);
      const row = withData ? await db.attachedFile.findUnique({ where: { id: f.id }, select: { data: true } }) : null;
      out.push({ name, data: row ? new Uint8Array(row.data as unknown as Uint8Array) : new Uint8Array() });
    }
  }
  return out;
}
