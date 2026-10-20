// Pure helpers (safe for client components) — the server-only half is in api-key-expiry.ts.

export type ExpiryInfo = { expiresAt: string | null; noExpiry: boolean } | null;

export type ExpiryState = "none" | "ok" | "soon" | "expired";

/** Where a key stands: expired, expiring within 14 days, fine, or no date known. */
export function expiryState(expiresAt: Date | string | null | undefined, noExpiry?: boolean, now = new Date()): { state: ExpiryState; days: number | null } {
  if (noExpiry || !expiresAt) return { state: "none", days: null };
  const days = Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86400000);
  return { state: days < 0 ? "expired" : days <= 14 ? "soon" : "ok", days };
}
