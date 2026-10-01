import { promoteContact } from "@/lib/project-progress";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withScopedPrismaClient } from "@/lib/prisma";
import { findContactIdByPhone, getTwilioConfig, publicBaseUrl, verifyTwilioSignature } from "@/lib/twilio";

// Twilio's "A message comes in" webhook for the CRM's number. Public on
// purpose (Twilio has no session) — every request is authenticated by
// Twilio's HMAC signature instead. Each text becomes a Calls & SMS entry on
// the contact whose phone number it came from; a number that matches nobody
// stays unlinked on the SMS page until someone links it.
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const xml = (status = 200) => new NextResponse(EMPTY_TWIML, { status, headers: { "Content-Type": "text/xml" } });

export async function POST(request: NextRequest) {
  const params = new URLSearchParams(await request.text());

  const result = await withScopedPrismaClient(async (db) => {
    const config = await getTwilioConfig(db);
    if (!config) return { status: 503 as const };

    const base = publicBaseUrl(request.nextUrl.origin);
    const valid = await verifyTwilioSignature(`${base}/api/twilio/sms`, params, request.headers.get("x-twilio-signature"), config.authToken);
    if (!valid) return { status: 403 as const };

    const sid = params.get("MessageSid");
    const from = params.get("From");
    if (!sid || !from) return { status: 400 as const };

    // Twilio retries on timeouts — the unique MessageSid makes that harmless.
    const existing = await db.interaction.findUnique({ where: { externalId: sid }, select: { id: true } });
    if (existing) return { status: 200 as const };

    // No match is fine: the text is kept unlinked and waits on the SMS page
    // until it's linked to a contact (or a new one is created from it).
    const contactId = await findContactIdByPhone(db, from);

    const mediaCount = Number(params.get("NumMedia") ?? "0");
    const body = [params.get("Body") ?? "", mediaCount > 0 ? `[${mediaCount} attachment${mediaCount > 1 ? "s" : ""} — view in your Twilio console]` : ""]
      .filter(Boolean)
      .join("\n");

    await db.interaction.create({
      data: {
        type: "SMS",
        direction: "INBOUND",
        externalId: sid,
        externalNumber: from,
        deliveryStatus: "received",
        notes: body,
        contactId,
        ...(contactId ? { participants: { create: [{ contactId }] } } : {}),
      },
    });
    if (contactId) await promoteContact(db, contactId, "PROSPECT");
    return { status: 200 as const, contactId };
  });

  if (result.status !== 200) return new NextResponse(null, { status: result.status });
  if ("contactId" in result && result.contactId) revalidatePath(`/contacts/${result.contactId}`);
  return xml();
}
