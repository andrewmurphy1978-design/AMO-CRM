import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { buildProjectMarkdownFiles } from "@/lib/project-ai-export";
import { getValidAccessToken } from "@/lib/google";
import { getLinkedCalendarEvents } from "@/lib/calendar-links";
import { createZip } from "@/lib/zip";

// GET /api/projects/<id>/ai-export
//   ?format=zip            every Markdown file (project + client) and brand files, as a .zip
//   ?format=md             every file joined into one .md
//   ?file=01-project.md    one file
//   &apikeys=1             (admins) include API keys flagged "Share with AI"
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const url = new URL(request.url);

  const isAdmin = session.user.role === "ADMIN";
  const wantKeys = url.searchParams.get("apikeys") === "1";
  if (wantKeys && !isAdmin) return new Response("Forbidden", { status: 403 });

  const built = await withScopedPrismaClient(async (db) => {
    const token = await getValidAccessToken(session.user.id, db);
    const calendarEvents = await getLinkedCalendarEvents(db, { projectId: id }, token).catch(() => []);
    return buildProjectMarkdownFiles(db, id, { isAdmin, includeSharedApiKeys: wantKeys, origin: url.origin, calendarEvents });
  });
  if (!built) return new Response("Not found", { status: 404 });

  const slug = built.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const file = url.searchParams.get("file");
  const format = url.searchParams.get("format");

  if (file) {
    const found = built.files.find((f) => f.name === file);
    if (!found) return new Response("Not found", { status: 404 });
    return new Response(found.content, {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-${found.name}"` },
    });
  }

  if (format === "md") {
    const combined = built.files.map((f) => `<!-- ${f.name} -->\n\n${f.content}`).join("\n---\n\n");
    const asText = url.searchParams.get("inline") === "1";
    return new Response(combined, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        ...(asText ? {} : { "Content-Disposition": `attachment; filename="${slug}-ai-briefing.md"` }),
      },
    });
  }

  const zip = createZip([...built.files, ...built.binaryFiles]);
  return new Response(zip as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}-ai-briefing.zip"` },
  });
}
