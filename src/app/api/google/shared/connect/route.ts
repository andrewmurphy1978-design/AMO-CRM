import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Starts "Connect with Google" for one shared mailbox (admins only). The person signing in must pick the shared mailbox's
// own Google account. It reuses the existing /api/google/callback redirect URI (already registered with Google); the
// state "mb:<mailboxId>" tells that callback this is a shared mailbox, not the user's personal connection. Only Gmail
// read + send are requested.
export async function GET(request: NextRequest) {
  const session = await auth();
  const base = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
  if (!session || session.user.role !== "ADMIN") return NextResponse.redirect(new URL("/settings", base));
  const mailboxId = request.nextUrl.searchParams.get("mailboxId");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!mailboxId || !clientId) return NextResponse.redirect(new URL("/settings?google=missing_config", base));

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${base}/api/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"].join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("state", `mb:${mailboxId}`);
  const res = NextResponse.redirect(url.toString());
  // Binds the round trip to this browser, so a forged callback link cannot attach someone else's Google account.
  res.cookies.set("mb_oauth", mailboxId, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/google" });
  return res;
}
