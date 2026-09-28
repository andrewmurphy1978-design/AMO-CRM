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

// One identity color per contact source. No such convention existed
// before this card — `source` was always shown as raw, uncolored text
// (see contacts/page.tsx, contacts/[id]/page.tsx) — introduced here for
// the same "count + color" sub-card treatment as everything else on this
// card. "Other" covers a blank source or any free-text value a user typed
// on the Contact form that isn't one of the three the app itself sets.
export const CONTACT_SOURCE_COLORS = {
  systemeIo: { bg: "bg-teal-600", text: "text-white" },
  manual: { bg: "bg-slate-500", text: "text-white" },
  google: { bg: "bg-blue-600", text: "text-white" },
  other: { bg: "bg-gray-400", text: "text-white" },
} as const;

// Solid-tile versions of new-contacts-card.tsx's own STAGE_COLORS (which
// are light pastel badges, not meant for a bold sub-card face) — same
// hues, kept in sync manually for the same reason as CONTACT_NEW_COLORS.
export const CONTACT_STAGE_COLORS: Record<
  string,
  { bg: string; text: string }
> = {
  LEAD: { bg: "bg-emerald-600", text: "text-white" },
  PROSPECT: { bg: "bg-teal-600", text: "text-white" },
  CLIENT: { bg: "bg-sky-600", text: "text-white" },
  PAST_CLIENT: { bg: "bg-red-400", text: "text-white" },
  UNSUBSCRIBED: { bg: "bg-red-200", text: "text-red-900" },
  PERSONAL: { bg: "bg-violet-500", text: "text-white" },
};
