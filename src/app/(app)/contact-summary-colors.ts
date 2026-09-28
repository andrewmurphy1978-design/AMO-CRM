// The Contacts card's own identity color — used on its top accent bar, its
// background tint, and its Summary stat card, the same way
// email-section-colors.ts's EMAIL_CARD_* and calendar-summary-colors.ts's
// CALENDAR_CARD_* link their own card pairs. Fuchsia is deliberately
// distinct from the emerald/sky/violet already used by the New/Yesterday/
// This-week buckets below, so the card's own identity never blends into
// one of its own metric colors.
export const CONTACT_CARD_ACCENT_BAR = "bg-fuchsia-600";
export const CONTACT_CARD_ACCENT_DOT = "bg-fuchsia-600";
export const CONTACT_CARD_BG = "bg-fuchsia-50";

// Same three colors as new-contacts-card.tsx's own local SECTION_COLORS
// (headerBg/headerText) — kept in sync manually since that file's copy is
// deliberately local (nothing else used them before now).
export const CONTACT_NEW_COLORS = {
  TODAY: { bg: "bg-emerald-500", text: "text-white" },
  YESTERDAY: { bg: "bg-sky-500", text: "text-white" },
  THIS_WEEK: { bg: "bg-violet-500", text: "text-white" },
} as const;

// One identity color per contact source shown on the card — only the two
// sources actually worth distinguishing at a glance (systeme.io sync vs.
// a Google Contacts import); manual entries and anything else still count
// toward "total contacts" but aren't broken out here. No such convention
// existed before this card — `source` was always shown as raw, uncolored
// text (see contacts/page.tsx, contacts/[id]/page.tsx).
export const CONTACT_SOURCE_COLORS = {
  systemeIo: { bg: "bg-teal-600", text: "text-white" },
  google: { bg: "bg-blue-600", text: "text-white" },
} as const;

// The 6 ContactStage values collapse into 2 groups for the Summary card:
// Lead/Prospect/Client (still-active sales pipeline) and Past client/
// Unsubscribed/Personal (no longer active). Colors are new, not reused
// from any individual stage's own color, since a group isn't any one of
// its member stages.
export const CONTACT_STAGE_GROUP_COLORS = {
  active: { bg: "bg-teal-600", text: "text-white" },
  inactive: { bg: "bg-slate-500", text: "text-white" },
} as const;
