import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Kicks off the OAuth consent flow for Gmail (read + send) + Calendar
// (read/write events — calendar.events rather than the broader calendar
// scope, since the in-app Calendar only ever creates/edits/deletes events,
// never touches calendar list/settings) + Contacts (full read/write —
// google-contacts.ts both pulls Google Contacts into the CRM and pushes a
// CRM edit back onto the same Google contact, see pushContactToGoogle;
// contacts.readonly, used before the push direction existed, can't do the
// latter). gmail.send (added alongside the Email Dialog's Reply/Forward
// feature) is the narrowest scope that allows users.messages.send — it
// grants nothing beyond sending, no draft/label access.
// `access_type=offline` + `prompt=consent` together are what make Google
// hand back a refresh_token — without both, a returning user who already
// granted consent gets a silent redirect with no refresh_token at all.
// Existing connections made before calendar.events, gmail.send, or the
// contacts scopes were added need to reconnect once (Settings ->
// Disconnect, then Connect again) before event edits / sending mail /
// importing contacts / editing a Google-imported contact will work —
// their stored refresh token only carries whichever grant was current
// when they connected.
export async function GET(request: NextRequest) {
  const session = await auth();
  const base = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
  if (!session) {
    return NextResponse.redirect(new URL("/settings", base));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/settings?google=missing_config", base));
  }

  const scope = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/contacts",
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
