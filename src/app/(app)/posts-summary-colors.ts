// The Post Summary / Post Details cards' own identity color (teal), used on the top accent bar, the background tint and
// the headline stat — same pairing convention as every other Dashboard card/summary pair.
export const POSTS_CARD_ACCENT_BAR = "bg-teal-600";
export const POSTS_CARD_ACCENT_DOT = "bg-teal-600";
export const POSTS_CARD_BG = "bg-teal-50";

// Brand colors of the two places posts wait, plus sent / failed.
export const POSTS_BUCKET_COLORS = {
  MAKE: { bg: "bg-[#6D00CC]", text: "text-white" },
  BUFFER: { bg: "bg-[#2C4BFF]", text: "text-white" },
  SENT: { bg: "bg-emerald-600", text: "text-white" },
  FAILED: { bg: "bg-rose-600", text: "text-white" },
  FAILED_NONE: { bg: "bg-slate-500", text: "text-white" },
} as const;
