import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { draftBookCallEmail } from "@/lib/book-call-email";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return new Response("Unauthorized", { status: 401 });
    const { id } = await params;
    return Response.json(await withScopedPrismaClient((db) => draftBookCallEmail(db, id)));
  } catch (err) {
    return Response.json({ error: `Server error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}` });
  }
}
