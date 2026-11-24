import { NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { CHALLENGE_COOKIE, finishRegistration, readChallengeCookie, relyingParty } from "@/lib/passkey";

// Step 2: the device signed the challenge; check it and save the new passkey.
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { response?: RegistrationResponseJSON; deviceName?: string } | null;
  if (!body?.response) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { rpID, origin } = relyingParty(request.url);
  const result = await withScopedPrismaClient((db) =>
    finishRegistration(db, {
      userId: session.user.id,
      challengeId: readChallengeCookie(request.headers.get("cookie")),
      response: body.response!,
      deviceName: body.deviceName ?? "",
      rpID,
      origin,
    })
  );
  const res = NextResponse.json(result, { status: result.ok ? 200 : 400 });
  res.cookies.delete(CHALLENGE_COOKIE);
  return res;
}
