// One accent color per Email category, shared by the Email page's own
// section headers (email-screening-view.tsx) and the Dashboard's
// condensed Email card (email-card.tsx) — kept in one place so the two
// never drift apart.
export interface EmailSectionColorSet {
  headerBg: string;
  headerText: string;
  badgeBg: string;
  badgeText: string;
}

// The Email card's own identity color — used on its top accent bar and on
// the Email Summary stat card (which links the two visually and is what
// the color-matching request asked for), distinct from every one of the
// per-category colors below it sits above.
export const EMAIL_CARD_ACCENT_BAR = "bg-indigo-500";
export const EMAIL_CARD_ACCENT_DOT = "bg-indigo-500";
// A light tint of that same identity color, for the card's own background
// (both the Email card and its Summary card) instead of the neutral
// bg-card-bg every other dashboard card uses.
export const EMAIL_CARD_BG = "bg-indigo-50";

export const EMAIL_SECTION_COLORS: Record<string, EmailSectionColorSet> = {
  DRAFTS: { headerBg: "bg-orange-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  NEEDS_REPLY: { headerBg: "bg-rose-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  SENT_AWAITING_REPLY: { headerBg: "bg-amber-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  NEEDS_ATTENTION: { headerBg: "bg-blue-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  CAN_WAIT: { headerBg: "bg-violet-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  LOW_PRIORITY: { headerBg: "bg-slate-300", headerText: "text-slate-800", badgeBg: "bg-white/60", badgeText: "text-slate-800" },
  RECENTLY_READ: { headerBg: "bg-gray-200", headerText: "text-gray-700", badgeBg: "bg-white/70", badgeText: "text-gray-700" },
  RECENTLY_LINKED: { headerBg: "bg-emerald-200", headerText: "text-emerald-900", badgeBg: "bg-white/60", badgeText: "text-emerald-900" },
  COMPLETED: { headerBg: "bg-emerald-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
};
