import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { loadProposalPdfData } from "@/lib/document-data";
import { buildProposalPdf } from "@/lib/proposal-pdf";
import { verifyPath } from "@/lib/signed-url";

// GET /api/projects/<id>/proposals/<proposalId>/pdf
// For team members (logged in), or anyone holding a signed, expiring link
// (what the "Send to client" email contains).
export async function GET(request: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await params;
  const url = new URL(request.url);
  const signedOk = await verifyPath(`/api/projects/${id}/proposals/${proposalId}/pdf`, url.searchParams.get("exp"), url.searchParams.get("sig"));
  if (!signedOk && !(await auth())) return new Response("Unauthorized", { status: 401 });

  const loaded = await withScopedPrismaClient((db) => loadProposalPdfData(db, id, proposalId));
  if (!loaded) return new Response("Not found", { status: 404 });
  const pdf = await buildProposalPdf(loaded.data);
  return new Response(pdf as unknown as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${loaded.fileName}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
