import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { loadInvoicePdfData } from "@/lib/document-data";
import { buildInvoicePdf } from "@/lib/proposal-pdf";
import { verifyPath } from "@/lib/signed-url";

// GET /api/projects/<id>/invoices/<invoiceId>/pdf — team members, or a signed link.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const { id, invoiceId } = await params;
  const url = new URL(request.url);
  const signedOk = await verifyPath(`/api/projects/${id}/invoices/${invoiceId}/pdf`, url.searchParams.get("exp"), url.searchParams.get("sig"));
  if (!signedOk && !(await auth())) return new Response("Unauthorized", { status: 401 });

  const loaded = await withScopedPrismaClient((db) => loadInvoicePdfData(db, id, invoiceId));
  if (!loaded) return new Response("Not found", { status: 404 });
  const pdf = await buildInvoicePdf(loaded.data);
  return new Response(pdf as unknown as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${loaded.fileName}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
