// The Calendar card's own identity color — used on its top accent bar,
// its background tint, and its Summary stat card, the same way
// email-section-colors.ts's EMAIL_CARD_* constants link the Email card
// and its Summary card. Distinct from the Email pair's indigo.
export const CALENDAR_CARD_ACCENT_BAR = "bg-sky-600";
export const CALENDAR_CARD_ACCENT_DOT = "bg-sky-600";
export const CALENDAR_CARD_BG = "bg-sky-50";

// One accent color per Calendar Summary metric — same "colored sub-card"
// approach as EMAIL_SECTION_COLORS, kept here since these four are
// specific to the Calendar Summary card rather than shared with the
// Calendar page's own category sections.
export const CALENDAR_METRIC_COLORS = {
  NEW: { bg: "bg-cyan-600", text: "text-white" },
  SHIFTS: { bg: "bg-amber-600", text: "text-white" },
  CHILDREN: { bg: "bg-teal-600", text: "text-white" },
  MOMMY: { bg: "bg-pink-500", text: "text-white" },
} as const;
