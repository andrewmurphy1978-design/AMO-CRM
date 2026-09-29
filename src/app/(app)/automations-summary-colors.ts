// The Automations card's own identity color — used on its top accent bar,
// its background tint, and its Summary stat card, the same pairing
// convention as every other Dashboard card/summary pair (see
// affiliate-summary-colors.ts). Violet is distinct from every other card's
// identity (indigo/sky/fuchsia/amber/cyan/pink already taken).
export const AUTOMATIONS_CARD_ACCENT_BAR = "bg-violet-600";
export const AUTOMATIONS_CARD_ACCENT_DOT = "bg-violet-600";
export const AUTOMATIONS_CARD_BG = "bg-violet-50";

export const AUTOMATIONS_BUCKET_COLORS = {
  SUCCESS: { bg: "bg-emerald-600", text: "text-white" },
  FAILED: { bg: "bg-rose-600", text: "text-white" },
  MAKE: { bg: "bg-teal-600", text: "text-white" },
  ZAPIER: { bg: "bg-amber-600", text: "text-white" },
} as const;
