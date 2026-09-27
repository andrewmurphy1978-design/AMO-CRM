// The Calendar card's own identity color — used on its top accent bar,
// its background tint, and its Summary stat card, the same way
// email-section-colors.ts's EMAIL_CARD_* constants link the Email card
// and its Summary card. Distinct from the Email pair's indigo.
export const CALENDAR_CARD_ACCENT_BAR = "bg-sky-600";
export const CALENDAR_CARD_ACCENT_DOT = "bg-sky-600";
export const CALENDAR_CARD_BG = "bg-sky-50";

// One accent color per Calendar Summary metric — same "colored sub-card"
// approach as EMAIL_SECTION_COLORS, kept here since these are specific to
// the Calendar Summary card rather than shared with the Calendar page's
// own category sections. Business/Shifts/the Children+Mommy card below
// deliberately reuse Google Calendar's own named event colors (Basil,
// Flamingo, Banana, Graphite — see GOOGLE_EVENT_COLORS in
// src/lib/calendar-colors.ts) since those metrics are themselves computed
// from an event's own colorId, not an arbitrary UI accent.
export const CALENDAR_METRIC_COLORS = {
  NEW: { bg: "bg-cyan-600", text: "text-white" },
  BUSINESS: { bg: "bg-[#0b8043]", text: "text-white" }, // Basil
  SHIFTS: { bg: "bg-[#e67c73]", text: "text-white" }, // Flamingo
} as const;

// The combined Children/Mommy card splits its face 2/3 Banana (children)
// on top, 1/3 Graphite (mommy) on the bottom, matching the same colorId
// each half's count is filtered by.
export const CHILDREN_MOMMY_COLORS = {
  banana: { bg: "bg-[#f6bf26]", text: "text-black" },
  graphite: { bg: "bg-[#616161]", text: "text-white" },
} as const;
