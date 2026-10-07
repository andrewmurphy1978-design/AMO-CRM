import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { brandFileEntries } from "@/lib/brand-zip";
import { isDataUri } from "@/lib/brand";
import { createZip } from "@/lib/zip";
import { generatePhasePrompt } from "@/actions/phase-prompts";

// GET /api/projects/<id>/phase-zip?phase=<phaseId>: the Brand / Research task as ONE .zip to attach to an AI chat:
// TASK.md (the full prompt), the Brand card (brand.md) and the client's uploaded brand files.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await build(request, params);
  } catch (err) {
    console.error("phase zip failed", err);
    return new Response(`Could not build the zip: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`, { status: 500 });
  }
}

async function build(request: Request, params: Promise<{ id: string }>) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const phaseId = new URL(request.url).searchParams.get("phase") ?? "";
  const built = await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id }, select: { name: true, contactId: true } });
    if (!project) return null;
    const rows = await db.contactBrandItem.findMany({ where: { contactId: project.contactId }, orderBy: [{ category: "asc" }, { order: "asc" }] });
    return { project, rows };
  });
  if (!built) return new Response("Not found", { status: 404 });
  const task = phaseId ? await generatePhasePrompt(id, phaseId).catch(() => null) : null;

  const entries = brandFileEntries(built.rows);
  const byId = new Map(entries.map((e) => [e.id, e.name]));
  const card =
    `# Brand card: ${built.project.name}\n\n` +
    (built.rows.length ? built.rows.map((r) => `- ${r.category} | ${r.label}${r.value ? ` | ${isDataUri(r.value) ? `file: ${byId.get(r.id) ?? "(attached)"}` : r.value}` : ""}${r.note ? ` - ${r.note}` : ""}`).join("\n") : "(nothing recorded yet)") +
    "\n";
  const readme = "# Inputs for the task\n\nTASK.md is the full task: read it first and carry it out. Every other file is INPUT material for that task (brand.md = the client's Brand card, brand-files/ = uploaded logos, icons and images). Do not ask what to do with these files.\n";
  const zip = createZip([
    ...(task?.prompt ? [{ name: "TASK.md", content: task.prompt }] : []),
    { name: "README.md", content: readme },
    { name: "brand.md", content: card },
    ...entries.map((e) => ({ name: e.name, data: e.data })),
  ]);
  const slug = built.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  return new Response(zip as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}-task.zip"` },
  });
}
