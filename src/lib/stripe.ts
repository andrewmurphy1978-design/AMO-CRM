import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { signPath, verifyPath } from "@/lib/signed-url";
import { onProposalAccepted, syncProjectLifecycle } from "@/lib/project-progress";

// Stripe, talked to over plain HTTPS (no SDK: it runs fine on Cloudflare Workers this way).
// Settings > Stripe stores the secret key (encrypted) and the webhook signing secret.

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string | null;
}

export async function getStripeConfig(db: PrismaClient): Promise<StripeConfig | null> {
  const row = await db.integrationSetting.findUnique({ where: { provider: "stripe" } });
  if (!row?.apiKeyEncrypted) return null;
  const meta = (row.metadata ?? {}) as { webhookSecretEnc?: string };
  return {
    secretKey: await decryptSecret(row.apiKeyEncrypted),
    webhookSecret: meta.webhookSecretEnc ? await decryptSecret(meta.webhookSecretEnc) : null,
  };
}

const enc = (v: string) => encodeURIComponent(v);

// Stripe wants application/x-www-form-urlencoded with bracketed keys.
function form(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .join("&");
}

export async function createCheckoutSession(
  config: StripeConfig,
  input: { invoiceId: string; description: string; amount: number; currency: string; email?: string | null; successUrl: string; cancelUrl: string; locale: "en" | "fr" }
): Promise<{ url: string } | { error: string }> {
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": input.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(Math.round(input.amount * 100)),
    "line_items[0][price_data][product_data][name]": input.description.slice(0, 250),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.invoiceId,
    "metadata[invoiceId]": input.invoiceId,
    "payment_intent_data[metadata][invoiceId]": input.invoiceId,
    locale: input.locale,
  };
  if (input.email) params.customer_email = input.email;
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form(params),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !data.url) return { error: data.error?.message ?? `Stripe returned HTTP ${res.status}.` };
    return { url: data.url };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't reach Stripe." };
  }
}

// Stripe signs each webhook: header "t=<time>,v1=<hmac>" where hmac = HMAC-SHA256(secret, "<t>.<body>").
export async function verifyStripeSignature(body: string, header: string | null, secret: string, toleranceSeconds = 300): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((s) => {
    if (s.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

// ---- the client's payment link: /pay/<invoiceId>?exp=…&sig=… (signed, valid for a year)

export async function payLinkFor(origin: string, invoiceId: string): Promise<string> {
  const path = `/pay/${invoiceId}`;
  const { exp, sig } = await signPath(path, 365 * 86400);
  return `${origin.replace(/\/$/, "")}${path}?exp=${exp}&sig=${sig}`;
}

export async function verifyPayLink(invoiceId: string, exp: string | null, sig: string | null): Promise<boolean> {
  return verifyPath(`/pay/${invoiceId}`, exp, sig);
}

// A card payment arrived for this invoice: the invoice (and the instalment it bills) is paid, and the
// project moves on exactly as if you had ticked the payment yourself. Safe to run twice.
export async function markInvoicePaid(db: PrismaClient, invoiceId: string): Promise<boolean> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return false;
  if (invoice.status === "PAID") return true;
  const now = new Date();
  await db.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: now, approvedAt: invoice.approvedAt ?? now, sentAt: invoice.sentAt ?? now } });
  if (invoice.instalmentId) {
    await db.proposalPaymentScheduleItem.update({ where: { id: invoice.instalmentId }, data: { paid: true, paidAt: now } });
    await onProposalAccepted(db, invoice.projectId);
  }
  await syncProjectLifecycle(db, invoice.projectId);
  return true;
}
