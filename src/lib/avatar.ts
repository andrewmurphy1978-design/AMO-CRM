// A fixed palette for the letter-avatar picker — distinct, readable-with-white-text
// colors, unrelated to the per-card CARD_COLORS palette so the two never get confused.
export const AVATAR_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

export function initialsFor(firstName?: string | null, lastName?: string | null): string {
  const a = (firstName ?? "").trim().charAt(0);
  const b = (lastName ?? "").trim().charAt(0);
  const initials = `${a}${b}`.toUpperCase();
  return initials || "?";
}

// Renders a colored-circle letter avatar as a self-contained SVG data URI —
// stored directly in Contact.avatarUrl (no new schema/storage needed) so
// every existing `<img src={contact.avatarUrl}>` call site across the app
// keeps working unchanged.
export function initialsAvatarDataUri(initials: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><circle cx="64" cy="64" r="64" fill="${color}"/><text x="64" y="66" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="600" fill="#ffffff">${initials}</text></svg>`;
  const base64 = typeof window !== "undefined" ? window.btoa(svg) : Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

// True for the SVG letter-avatars this file generates — lets the picker UI
// tell "a real uploaded photo" apart from "a letter avatar it created
// earlier", e.g. to leave a real photo alone when just changing the initials.
export function isGeneratedInitialsAvatar(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith("data:image/svg+xml;base64,"));
}
