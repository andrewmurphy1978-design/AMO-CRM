import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveGoogleTokens } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";

function errorRedirect(base: string, reason: string) {
  const url = new URL("/settings", base);
  url.searchParams.set("google", "error");
  url.searchParams.set("reason", reason.slice(0, 300));
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const base = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
  if (!session) {
    return NextResponse.redirect(new URL("/settings", base));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    const oauthError = request.nextUrl.searchParams.get("error");
    return errorRedirect(base, oauthError ? `Google returned: ${oauthError}` : "No authorization code in callback");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return errorRedirect(base, "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${base}/api/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      console.error(`Google token exchange failed: HTTP ${tokenRes.status} ${body}`);
      return errorRedirect(base, `Token exchange failed: HTTP ${tokenRes.status} ${body}`);
    }
    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    let email: string | null = null;
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) email = ((await userRes.json()) as { email?: string }).email ?? null;
    } catch {
      // Non-critical — the connection still works without a display email.
    }

    // saveGoogleTokens reads the existing row and then writes the new one —
    // one shared client for both instead of two fresh connections (see
    // src/lib/prisma.ts on why that matters for Cloudflare's Error 1102).
    await withScopedPrismaClient((db) =>
      saveGoogleTokens(
        session.user.id,
        {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        },
        db,
        email
      )
    );

    return NextResponse.redirect(new URL("/settings?google=connected", base));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Google OAuth callback failed: ${message}`);
    return errorRedirect(base, message);
  }
}
