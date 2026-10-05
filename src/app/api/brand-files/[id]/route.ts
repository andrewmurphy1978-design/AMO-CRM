import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { verifyPath } from "@/lib/signed-url";
import { isDataUri } from "@/lib/brand";

// GET /api/brand-files/<brand item id>?exp=<unix>&sig=<hmac>
// Serves a file uploaded to a contact's Brand card. No login: access is by a
// signed, expiring link (made by Export for AI), so an AI can download it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  // Logged-in users (the Brand card shows its files through this route) need no signature.
  const session = await auth();
  if (!session && !(await verifyPath(`/api/brand-files/${id}`, url.searchParams.get("exp"), url.searchParams.get("sig")))) {
    return new Response("This link is invalid or has expired.", { status: 403 });
  }

  const item = await withScopedPrismaClient((db) => db.contactBrandItem.findUnique({ where: { id }, select: { label: true, value: true } }));
  const value = item?.value ?? "";
  if (!item || !isDataUri(value)) return new Response("Not found", { status: 404 });

  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([\s\S]*)$/i.exec(value.trim());
  if (!match) return new Response("Not found", { status: 404 });
  const [, mime, b64] = match;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ext = mime.split("/")[1]?.replace("svg+xml", "svg").replace("jpeg", "jpg") ?? "bin";
  const name = `${(item.label || "file").replace(/[^\w.-]+/g, "-")}.${ext}`;

  return new Response(bytes, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${name}"`,
      // SVGs can carry script: serve them as inert files.
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
