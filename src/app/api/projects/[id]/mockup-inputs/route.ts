import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { brandFileEntries } from "@/lib/brand-zip";
import { isDataUri } from "@/lib/brand";
import { createZip } from "@/lib/zip";
import { mockupInputFiles } from "@/lib/mockup-inputs";

// GET /api/projects/<id>/mockup-inputs: everything gathered in the Brand and Research phases, as one .zip
// to drag and drop into an AI chat together with the Mock-up prompt.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await build(params);
  } catch (err) {
    console.error("mockup inputs zip failed", err);
    return new Response(`Could not build the zip: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`, { status: 500 });
  }
}

async function build(params: Promise<{ id: string }>) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const built = await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id }, select: { name: true, contactId: true } });
    if (!project) return null;
    const rows = await db.contactBrandItem.findMany({ where: { contactId: project.contactId }, orderBy: [{ category: "asc" }, { order: "asc" }] });
    return { project, rows, files: await mockupInputFiles(db, id, project.contactId, true) };
  });
  if (!built) return new Response("Not found", { status: 404 });

  const entries = brandFileEntries(built.rows);
  const byId = new Map(entries.map((e) => [e.id, e.name]));
  const card =
    `# Brand card: ${built.project.name}\n\n` +
    built.rows.map((r) => `- ${r.category} | ${r.label}${r.value ? ` | ${isDataUri(r.value) ? `file: ${byId.get(r.id) ?? "(attached)"}` : r.value}` : ""}${r.note ? ` - ${r.note}` : ""}`).join("\n") +
    "\n";
  const readme =
    "# Inputs for the mock-ups\n\n" +
    "- brand/brand-card.md: the client's Brand card (colours, fonts, voice...), with brand/files/ holding the uploaded logos, icons and images\n" +
    "- brand/reports/: the brand reports\n" +
    "- research/reports/: the research reports: competitors, keywords, competitor blogs, content plan, recommendations\n" +
    "- research/screenshots/: some screenshots of the competitors' pages\n\n" +
    "Read ALL of it before designing: the mock-ups must follow the brand exactly and answer what the research found.\n";
  const zip = createZip([
    { name: "README.md", content: readme },
    { name: "brand/brand-card.md", content: card },
    ...entries.map((e) => ({ name: `brand/files/${e.name.replace(/^brand-files\//, "")}`, data: e.data })),
    ...built.files.map((f) => ({ name: f.name, data: f.data })),
  ]);
  const slug = built.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  return new Response(zip as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}-mockup-inputs.zip"` },
  });
}
