import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveGoogleTokens } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";
import { saveMailboxGoogleTokens } from "@/lib/mail/shared-mailbox";

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

  // "Connect with Google" for a shared mailbox (see /api/google/shared/connect): tokens belong to the mailbox, not the user.
  const state = request.nextUrl.searchParams.get("state");
  const sharedMailboxId = state?.startsWith("mb:") ? state.slice(3) : null;
  if (sharedMailboxId) {
    const back = (query: string) => {
      const res = NextResponse.redirect(new URL(`/settings?${query}`, base));
      res.cookies.delete("mb_oauth");
      return res;
    };
    if (session.user.role !== "ADMIN" || request.cookies.get("mb_oauth")?.value !== sharedMailboxId) return back("google=error&reason=Shared%20mailbox%20sign-in%20was%20not%20started%20from%20this%20browser");
    const sharedCode = request.nextUrl.searchParams.get("code");
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!sharedCode || !clientId || !clientSecret) return back("google=error&reason=Google%20did%20not%20return%20an%20authorization%20code");
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: sharedCode, client_id: clientId, client_secret: clientSecret, redirect_uri: `${base}/api/google/callback`, grant_type: "authorization_code" }),
      });
      if (!tokenRes.ok) return back(`google=error&reason=${encodeURIComponent(`Token exchange failed: HTTP ${tokenRes.status}`)}`);
      const t = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in: number };
      if (!t.refresh_token) return back("google=error&reason=Google%20did%20not%20return%20a%20refresh%20token");
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } });
      const email = userRes.ok ? (((await userRes.json()) as { email?: string }).email ?? "").toLowerCase() : "";
      const outcome = await withScopedPrismaClient(async (db) => {
        const box = await db.sharedMailbox.findUnique({ where: { id: sharedMailboxId } });
        if (!box) return "Shared mailbox not found";
        if (email && email !== box.address.toLowerCase()) return `You signed in as ${email}, but this mailbox is ${box.address}. Sign in with the mailbox's own Google account.`;
        await saveMailboxGoogleTokens(db, sharedMailboxId, { accessToken: t.access_token, refreshToken: t.refresh_token!, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() });
        return null;
      });
      return outcome ? back(`google=error&reason=${encodeURIComponent(outcome)}`) : back("google=connected");
    } catch (error) {
      return back(`google=error&reason=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
    }
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
