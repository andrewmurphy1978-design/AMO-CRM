import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

export const MAX_FILE_BYTES = 10_000_000;

// POST /api/files  (multipart form: one or more "file" parts + "contactId" or "projectId")
// Stores the files on that Contact or Project (the File card).
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const form = await request.formData();
  const contactId = String(form.get("contactId") ?? "") || null;
  const projectId = String(form.get("projectId") ?? "") || null;
  const kind = form.get("kind") === "BRAND_REPORT" ? "BRAND_REPORT" : null; // the AI brand report (Brand card)
  if (!contactId === !projectId) return Response.json({ error: "Give either a contact or a project." }, { status: 400 });
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (files.length === 0) return Response.json({ error: "No file." }, { status: 400 });

  const saved: string[] = [];
  const problems: string[] = [];
  await withScopedPrismaClient(async (db) => {
    for (const f of files) {
      if (f.size === 0) {
        problems.push(`${f.name}: empty file`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        problems.push(`${f.name}: over ${MAX_FILE_BYTES / 1_000_000} MB`);
        continue;
      }
      const bytes = new Uint8Array(await f.arrayBuffer());
      const row = await db.attachedFile.create({
        data: { contactId, projectId, name: f.name.slice(0, 200) || "file", mimeType: f.type || "application/octet-stream", size: bytes.length, data: bytes as never, uploadedByName: session.user.name ?? null, kind },
        select: { id: true },
      });
      saved.push(row.id);
    }
  });
  return Response.json({ saved: saved.length, problems });
}
