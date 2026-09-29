// The Affiliate Programs card's own identity color (cyan) — used on its
// top accent bar, background tint, and its Summary stat card, the same
// pairing convention as every other Dashboard card/summary pair (see
// contact-summary-colors.ts). The 4 bucket colors mirror the Marketing
// page's own Active/Pending/No-program card colors (see
// src/components/section-card.tsx's CARD_COLORS), plus a 4th ("declined/
// blocked") split out of what Marketing lumps into one "no program or
// declined" bucket — see dashboardBucketOf in src/lib/affiliate-status.ts.
export const AFFILIATE_CARD_ACCENT_BAR = "bg-cyan-600";
export const AFFILIATE_CARD_ACCENT_DOT = "bg-cyan-600";
export const AFFILIATE_CARD_BG = "bg-cyan-50";

export const AFFILIATE_BUCKET_COLORS = {
  ACTIVE: { bg: "bg-emerald-600", text: "text-white" },
  PENDING: { bg: "bg-amber-500", text: "text-white" },
  DECLINED_BLOCKED: { bg: "bg-rose-600", text: "text-white" },
  NO_PROGRAM: { bg: "bg-slate-500", text: "text-white" },
} as const;
