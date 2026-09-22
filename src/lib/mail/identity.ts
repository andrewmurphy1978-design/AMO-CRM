// Decides which of this user's known mail identities (their Gmail
// account, and later their IONOS mailbox) a reply should be sent from —
// the literal core rule behind this feature: always answer from the
// address that received the message, computed server-side so the
// compose dialog's From field can be locked rather than trusted from
// the client.

export type MailSource = "gmail" | "ionos";

export interface MailIdentity {
  source: MailSource;
  accountAddress: string;
  displayName: string | null;
}

export interface OriginalMessageAddresses {
  to: string[];
  cc: string[];
  deliveredTo: string;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

// Order of preference: (1) any known identity's address appearing in the
// original message's To/Cc/Delivered-To — this is what makes a message
// that merely arrived in Gmail but was addressed to the IONOS mailbox
// still get answered from that address; (2) the identity matching the
// message's own source (today, always "gmail" — Phase 3+ widens this);
// (3) the first identity, as a last resort so a reply is never blocked
// on an unmatched address.
export function resolveReplyIdentity(
  original: OriginalMessageAddresses,
  messageSource: MailSource,
  identities: MailIdentity[]
): MailIdentity {
  const addressed = new Set([...original.to, ...(original.cc ?? []), original.deliveredTo].filter(Boolean).map(normalize));
  const byAddress = identities.find((id) => addressed.has(normalize(id.accountAddress)));
  if (byAddress) return byAddress;

  const bySource = identities.find((id) => id.source === messageSource);
  if (bySource) return bySource;

  return identities[0];
}
