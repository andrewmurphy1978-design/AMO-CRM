import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// GET /api/projects/<id>/reports-bundle: the PDFs to send the client before the presentation call, in the client's
// language only: brand guides, research report, mock-up report and the approval form (as email attachments).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return new Response("Unauthorized", { status: 401 });
    const { id } = await params;
    const out = await withScopedPrismaClient(async (db) => {
      const p = await db.project.findUnique({ where: { id }, select: { contactId: true, contact: { select: { locale: true } } } });
      if (!p) return null;
      const suffix = (p.contact.locale ?? "").toLowerCase().startsWith("fr") ? "-FR.pdf" : "-EN.pdf";
      const rows = await db.attachedFile.findMany({
        where: { OR: [{ contactId: p.contactId, kind: "BRAND_PDF" }, { projectId: id, kind: { in: ["RESEARCH_PDF", "MOCKUP_PDF", "APPROVAL_PDF"] } }], name: { endsWith: suffix } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const attachments: { filename: string; mimeType: string; base64: string }[] = [];
      let total = 0;
      for (const r of rows) {
        const f = await db.attachedFile.findUnique({ where: { id: r.id }, select: { name: true, mimeType: true, data: true, size: true } });
        if (!f) continue;
        total += f.size;
        if (total > 15_000_000) break;
        attachments.push({ filename: f.name, mimeType: f.mimeType, base64: toBase64(new Uint8Array(f.data as unknown as Uint8Array)) });
      }
      return attachments;
    });
    return Response.json(out ? { attachments: out } : { error: "Project not found." });
  } catch (err) {
    return Response.json({ error: `Server error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}` });
  }
}
