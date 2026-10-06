import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

// GET /api/files/<id>            opens the file (images and PDFs show in the browser)
// GET /api/files/<id>?download=1 forces a download
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const row = await withScopedPrismaClient((db) => db.attachedFile.findUnique({ where: { id }, select: { name: true, mimeType: true, data: true } }));
  if (!row) return new Response("Not found", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const safe = row.mimeType.startsWith("image/") && !/svg/i.test(row.mimeType) || row.mimeType === "application/pdf";
  const name = row.name.replace(/[^\w.\- ()]+/g, "_");
  return new Response(row.data as unknown as BodyInit, {
    headers: {
      // Anything that could run script in the browser (HTML, SVG...) is only ever downloaded.
      "Content-Type": safe ? row.mimeType : "application/octet-stream",
      "Content-Disposition": `${download || !safe ? "attachment" : "inline"}; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
