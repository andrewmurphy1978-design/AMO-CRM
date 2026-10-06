import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLocalRoot, sepOf } from "@/lib/local-folders";

// GET  /api/local-folders  the folders that still have to be created on this computer (relative to the root)
// POST /api/local-folders  { contactIds: [], projectIds: [] } marks folders as created
export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const data = await withScopedPrismaClient(async (db) => {
    const root = await getLocalRoot(db);
    if (!root) return { root: null, items: [] };
    const [contacts, projects] = await Promise.all([
      db.contact.findMany({ where: { folderPath: { not: null }, folderCreatedAt: null }, select: { id: true, folderPath: true }, take: 500 }),
      db.project.findMany({ where: { folderPath: { not: null }, folderCreatedAt: null }, select: { id: true, folderPath: true }, take: 1000 }),
    ]);
    const sep = sepOf(root);
    const rel = (p: string) => p.slice(root.length).split(sep).filter(Boolean);
    const items = [
      ...contacts.filter((c) => c.folderPath!.startsWith(root)).map((c) => ({ kind: "contact" as const, id: c.id, segments: rel(c.folderPath!) })),
      ...projects.filter((p) => p.folderPath!.startsWith(root)).map((p) => ({ kind: "project" as const, id: p.id, segments: rel(p.folderPath!) })),
    ].filter((i) => i.segments.length > 0);
    return { root, items };
  });
  return Response.json(data);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const body = (await request.json()) as { contactIds?: string[]; projectIds?: string[] };
  const now = new Date();
  await withScopedPrismaClient(async (db) => {
    if (body.contactIds?.length) await db.contact.updateMany({ where: { id: { in: body.contactIds } }, data: { folderCreatedAt: now } });
    if (body.projectIds?.length) await db.project.updateMany({ where: { id: { in: body.projectIds } }, data: { folderCreatedAt: now } });
  });
  return Response.json({ ok: true });
}
