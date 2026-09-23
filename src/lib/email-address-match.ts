// Matches a received message's Delivered-To/To headers against the
// Settings-configured EmailAddressColor list, resolving which color dot
// (if any) the Email list should show before the sender name. Deliberately
// its own zero-dependency file rather than living in google.ts — see
// email-domain.ts's header comment for why a client-imported helper like
// this can't pull in a server-only module.
export interface EmailAddressColorEntry {
  address: string;
  color: string;
}

export function extractAddresses(raw: string): string[] {
  const angleBracketed = raw.match(/<([^>]+)>/g);
  if (angleBracketed) return angleBracketed.map((m) => m.slice(1, -1).trim().toLowerCase());
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

// The Sent side's equivalent match — a sent message's fromEmail is
// already a single bare address (see SentEmailSummary.fromEmail), so this
// skips the To/Delivered-To header parsing resolveEmailAddressColor below
// does for received mail.
export function colorForAddress(address: string | null | undefined, colors: EmailAddressColorEntry[]): string | null {
  if (!address) return null;
  const normalized = address.trim().toLowerCase();
  const match = colors.find((c) => c.address.trim().toLowerCase() === normalized);
  return match?.color ?? null;
}

// The single "which of my addresses is this" value worth persisting onto
// an EmailLink row at link time (see EmailLink.myAddress) — prefers
// Delivered-To (the more reliable signal) and falls back to the first To
// address when it's missing.
export function primaryReceivedAddress(email: { deliveredTo?: string; toRaw: string }): string | null {
  if (email.deliveredTo) return email.deliveredTo.trim().toLowerCase();
  return extractAddresses(email.toRaw)[0] ?? null;
}

export function resolveEmailAddressColor(
  email: { deliveredTo?: string; toRaw: string },
  colors: EmailAddressColorEntry[]
): string | null {
  if (colors.length === 0) return null;
  const candidates = new Set<string>();
  if (email.deliveredTo) candidates.add(email.deliveredTo.trim().toLowerCase());
  for (const addr of extractAddresses(email.toRaw)) candidates.add(addr);
  const match = colors.find((c) => candidates.has(c.address.trim().toLowerCase()));
  return match?.color ?? null;
}
