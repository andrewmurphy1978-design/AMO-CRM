import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { verifyPath } from "@/lib/signed-url";

// The file kept with a supplier invoice (team members only).
export async function GET(request: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const url = new URL(request.url);
  // Team members, or a signed expiring link (what the AI export contains).
  const signedOk = await verifyPath(`/api/projects/${id}/supplier-invoices/${sid}/file`, url.searchParams.get("exp"), url.searchParams.get("sig"));
  if (!signedOk && !(await auth())) return new Response("Unauthorized", { status: 401 });
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
