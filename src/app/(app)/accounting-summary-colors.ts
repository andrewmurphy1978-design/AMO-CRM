// The Accounting Summary / entity cards' own identity colour (emerald, like the Accounting icon).
export const ACCOUNTING_CARD_ACCENT_BAR = "bg-emerald-600";
export const ACCOUNTING_CARD_ACCENT_DOT = "bg-emerald-600";
export const ACCOUNTING_CARD_BG = "bg-emerald-50";

export const ACCOUNTING_BUCKET_COLORS = {
  TO_CATEGORIZE: { bg: "bg-amber-500", text: "text-white" },
  TO_CONFIRM: { bg: "bg-indigo-500", text: "text-white" },
  BANKS: { bg: "bg-sky-600", text: "text-white" },
  TAX: { bg: "bg-teal-600", text: "text-white" },
} as const;

// Proposals & Invoices Summary card.
export const PI_CARD_ACCENT_BAR = "bg-emerald-500";
export const PI_CARD_ACCENT_DOT = "bg-emerald-500";
export const PI_CARD_BG = "bg-emerald-50/40";
export const PI_BUCKET_COLORS = {
  SENT: { bg: "bg-indigo-500", text: "text-white" },
  UNPAID: { bg: "bg-amber-500", text: "text-white" },
  OVERDUE: { bg: "bg-rose-600", text: "text-white" },
  OVERDUE_NONE: { bg: "bg-slate-500", text: "text-white" },
  OWED: { bg: "bg-emerald-700", text: "text-white" },
} as const;
