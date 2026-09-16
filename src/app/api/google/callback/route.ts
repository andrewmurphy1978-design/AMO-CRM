import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveGoogleTokens } from "@/lib/google";

export async function GET(request: NextRequest) {
  const session = await auth();
  const base = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/settings", base));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/settings?google=error", base));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/settings?google=missing_config", base));
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
      return NextResponse.redirect(new URL("/settings?google=error", base));
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

    await saveGoogleTokens(
      {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      },
      email
    );

    return NextResponse.redirect(new URL("/settings?google=connected", base));
  } catch {
    return NextResponse.redirect(new URL("/settings?google=error", base));
  }
}
