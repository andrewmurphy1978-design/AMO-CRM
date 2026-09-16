import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Kicks off the OAuth consent flow for Gmail (read) + Calendar (read).
// `access_type=offline` + `prompt=consent` together are what make Google
// hand back a refresh_token — without both, a returning user who already
// granted consent gets a silent redirect with no refresh_token at all.
export async function GET(request: NextRequest) {
  const session = await auth();
  const base = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/settings", base));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/settings?google=missing_config", base));
  }

  const scope = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
  ].join(" ");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${base}/api/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return NextResponse.redirect(url.toString());
}
