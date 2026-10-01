import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

// The file kept with a supplier invoice (team members only).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  if (!(await auth())) return new Response("Unauthorized", { status: 401 });
  const { id, sid } = await params;
  const row = await withScopedPrismaClient((db) => db.projectSupplierInvoice.findUnique({ where: { id: sid }, select: { projectId: true, fileName: true, fileMime: true, fileData: true } }));
  if (!row || row.projectId !== id || !row.fileData) return new Response("Not found", { status: 404 });
  return new Response(row.fileData as unknown as BodyInit, {
    headers: {
      "Content-Type": row.fileMime ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${(row.fileName ?? "supplier-invoice").replace(/[^\w.-]+/g, "-")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
