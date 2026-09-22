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

export const EMAIL_SECTION_COLORS: Record<string, EmailSectionColorSet> = {
  NEEDS_REPLY: { headerBg: "bg-rose-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  SENT_AWAITING_REPLY: { headerBg: "bg-amber-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  NEEDS_ATTENTION: { headerBg: "bg-blue-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  CAN_WAIT: { headerBg: "bg-violet-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  LOW_PRIORITY: { headerBg: "bg-slate-300", headerText: "text-slate-800", badgeBg: "bg-white/60", badgeText: "text-slate-800" },
  RECENTLY_READ: { headerBg: "bg-gray-200", headerText: "text-gray-700", badgeBg: "bg-white/70", badgeText: "text-gray-700" },
  COMPLETED: { headerBg: "bg-emerald-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
};
