import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { challengeCookie, relyingParty, startRegistration } from "@/lib/passkey";

// Step 1 of setting up a passkey on this device (Settings → Biometric sign-in), for the signed-in user.
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { rpID, secure } = relyingParty(request.url);
  const result = await withScopedPrismaClient(async (db) => {
    const user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, name: true } });
    return user ? startRegistration(db, user, rpID) : null;
  });
  if (!result) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = NextResponse.json(result.options);
  res.cookies.set(challengeCookie(result.challengeId, secure));
  return res;
}
