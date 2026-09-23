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

function extractAddresses(raw: string): string[] {
  const angleBracketed = raw.match(/<([^>]+)>/g);
  if (angleBracketed) return angleBracketed.map((m) => m.slice(1, -1).trim().toLowerCase());
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
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
