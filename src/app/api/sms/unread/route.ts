import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

// The sidebar SMS badge: incoming texts not looked at yet, plus any from
// numbers matching no contact. Fetched by the browser after the page has
// rendered rather than inside the layout, so it never runs a database read
// at the same moment as the page's own queries (the Cloudflare/Hyperdrive
// concurrency problem documented in src/lib/prisma.ts).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ count: 0 }, { status: 401 });
  const count = await withScopedPrismaClient((db) =>
    db.interaction.count({ where: { type: "SMS", direction: "INBOUND", OR: [{ seenAt: null }, { contactId: null }] } })
  );
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
