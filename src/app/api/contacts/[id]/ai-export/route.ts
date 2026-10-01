import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { buildContactMarkdownFiles } from "@/lib/contact-ai-export";
import { createZip } from "@/lib/zip";

// GET /api/contacts/<id>/ai-export
//   ?format=zip            all the Markdown files in one .zip
//   ?format=md             every file joined into a single .md
//   ?file=01-profile.md    one file
//   &apikeys=1             (admins) include API keys flagged "Share with AI"
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const url = new URL(request.url);

  // API keys flagged "Share with AI" are included only on an explicit
  // ?apikeys=1 from an admin (the people who can see the credentials card).
  const isAdmin = session.user.role === "ADMIN";
  const wantKeys = url.searchParams.get("apikeys") === "1";
  if (wantKeys && !isAdmin) return new Response("Forbidden", { status: 403 });

  const built = await withScopedPrismaClient((db) => buildContactMarkdownFiles(db, id, { isAdmin, includeSharedApiKeys: wantKeys }));
  if (!built) return new Response("Not found", { status: 404 });

  const slug = built.contactName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "contact";
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

  const zip = createZip(built.files);
  return new Response(zip as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}-ai-briefing.zip"` },
  });
}
