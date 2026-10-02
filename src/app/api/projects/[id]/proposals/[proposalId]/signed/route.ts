import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

// The signed copy of a proposal returned by the client (team members only).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await params;
  if (!(await auth())) return new Response("Unauthorized", { status: 401 });
  const row = await withScopedPrismaClient((db) =>
    db.proposal.findUnique({ where: { id: proposalId }, select: { projectId: true, signedFileName: true, signedFileMime: true, signedFileData: true } })
  );
  if (!row || row.projectId !== id || !row.signedFileData) return new Response("Not found", { status: 404 });
  return new Response(row.signedFileData as unknown as BodyInit, {
    headers: {
      "Content-Type": row.signedFileMime ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${(row.signedFileName ?? "signed-proposal").replace(/[^\w.-]+/g, "-")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
