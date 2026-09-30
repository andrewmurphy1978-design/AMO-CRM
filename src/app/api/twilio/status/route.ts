import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getTwilioConfig, publicBaseUrl, verifyTwilioSignature } from "@/lib/twilio";

// Twilio's delivery-status callback for texts sent from the CRM
// (queued -> sent -> delivered, or undelivered/failed). Same signature check
// as the inbound webhook.
export async function POST(request: NextRequest) {
  const params = new URLSearchParams(await request.text());

  const contactId = await withScopedPrismaClient(async (db) => {
    const config = await getTwilioConfig(db);
    if (!config) return 503;

    const base = publicBaseUrl(request.nextUrl.origin);
    const valid = await verifyTwilioSignature(`${base}/api/twilio/status`, params, request.headers.get("x-twilio-signature"), config.authToken);
    if (!valid) return 403;

    const sid = params.get("MessageSid");
    const status = params.get("MessageStatus");
    if (!sid || !status) return 400;

    const entry = await db.interaction.findUnique({ where: { externalId: sid }, select: { id: true, contactId: true, updatedAt: true } });
    if (!entry) return 200;
    await db.interaction.update({
      where: { id: entry.id },
      // Delivery updates are Twilio's, not an edit — keep "last modified" as is.
      data: { deliveryStatus: status, errorCode: params.get("ErrorCode") || null, updatedAt: entry.updatedAt },
    });
    return entry.contactId;
  });

  if (typeof contactId === "number") return new NextResponse(null, { status: contactId });
  revalidatePath(`/contacts/${contactId}`);
  return new NextResponse(null, { status: 204 });
}
