import { NextResponse } from "next/server";
import { withScopedPrismaClient } from "@/lib/prisma";
import { challengeCookie, relyingParty, startLogin } from "@/lib/passkey";

// Step 1 of signing in with a passkey (login page). No account is named: the device offers the passkeys it holds
// for this site, and the "passkey" sign-in provider in src/lib/auth.ts finds the user from the one chosen.
export async function POST(request: Request) {
  const { rpID, secure } = relyingParty(request.url);
  const { options, challengeId } = await withScopedPrismaClient((db) => startLogin(db, rpID));
  const res = NextResponse.json(options);
  res.cookies.set(challengeCookie(challengeId, secure));
  return res;
}
