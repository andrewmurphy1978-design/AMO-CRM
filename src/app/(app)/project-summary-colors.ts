// The Projects card's own identity color — used on its top accent bar, its
// background tint, and its Summary card, the same way contact-summary-
// colors.ts's CONTACT_CARD_* and calendar-summary-colors.ts's
// CALENDAR_CARD_* link their own card pairs. Amber carries over the gold/
// amber association the removed "Open tasks" Dashboard stat used to have.
export const PROJECT_CARD_ACCENT_BAR = "bg-amber-600";
export const PROJECT_CARD_ACCENT_DOT = "bg-amber-600";
export const PROJECT_CARD_BG = "bg-amber-50";

export const PROJECT_PHASE_COLOR = { bg: "bg-teal-600", text: "text-white" } as const;
export const PROJECT_TASK_COLOR = { bg: "bg-blue-600", text: "text-white" } as const;

// Same emerald/sky/violet temporal-bucket convention as the Contact Summary
// card's own Today/Yesterday/This-week composite, just forward-looking here
// (Today/Tomorrow/This week) instead of backward-looking.
export const PROJECT_DEADLINE_COLORS = {
  TODAY: { bg: "bg-emerald-500", text: "text-white" },
  TOMORROW: { bg: "bg-sky-500", text: "text-white" },
  THIS_WEEK: { bg: "bg-violet-500", text: "text-white" },
} as const;
