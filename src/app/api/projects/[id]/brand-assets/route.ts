import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { brandFileEntries } from "@/lib/brand-zip";
import { isDataUri } from "@/lib/brand";
import { createZip } from "@/lib/zip";

// GET /api/projects/<id>/brand-assets: the client's uploaded brand files (logos, icons, photos...) and
// a short brand.md, as a .zip to drag and drop into an AI chat together with the task's prompt.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const built = await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id }, select: { name: true, contactId: true } });
    if (!project) return null;
    const rows = await db.contactBrandItem.findMany({ where: { contactId: project.contactId }, orderBy: [{ category: "asc" }, { order: "asc" }] });
    return { project, rows };
  });
  if (!built) return new Response("Not found", { status: 404 });

  const entries = brandFileEntries(built.rows);
  const byId = new Map(entries.map((e) => [e.id, e.name]));
  const md =
    `# Brand — ${built.project.name}\n\n` +
    built.rows.map((r) => `- ${r.category} | ${r.label}${r.value ? ` | ${isDataUri(r.value) ? `file: ${byId.get(r.id) ?? "(attached)"}` : r.value}` : ""}${r.note ? ` — ${r.note}` : ""}`).join("\n") +
    "\n";
  const zip = createZip([{ name: "brand.md", content: md }, ...entries.map((e) => ({ name: e.name, data: e.data }))]);
  const slug = built.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  return new Response(zip as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}-brand-assets.zip"` },
  });
}
