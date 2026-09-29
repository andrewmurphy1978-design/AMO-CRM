// The Social Media Analytics card's own identity color — used on its top
// accent bar, its background tint, and its Summary stat card, the same
// pairing convention as every other Dashboard card/summary pair (see
// affiliate-summary-colors.ts). Pink is distinct from every other card's
// identity (indigo/sky/fuchsia/amber/cyan already taken).
export const SOCIAL_CARD_ACCENT_BAR = "bg-pink-600";
export const SOCIAL_CARD_ACCENT_DOT = "bg-pink-600";
export const SOCIAL_CARD_BG = "bg-pink-50";

// Follower growth (net change since the last sync) flips color by sign —
// the only Summary metric on this card that can go negative.
export const SOCIAL_GROWTH_COLORS = {
  positive: { bg: "bg-emerald-600", text: "text-white" },
  negative: { bg: "bg-rose-600", text: "text-white" },
  flat: { bg: "bg-slate-500", text: "text-white" },
} as const;

export const SOCIAL_METRIC_COLORS = {
  engagement: { bg: "bg-violet-600", text: "text-white" },
  views: { bg: "bg-sky-600", text: "text-white" },
  platforms: { bg: "bg-teal-600", text: "text-white" },
} as const;
