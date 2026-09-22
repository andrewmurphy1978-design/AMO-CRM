// The "Affiliate Status" field used to be free text, with dozens of
// variants describing the same handful of real states (e.g. "Fallback
// active — apply via Impact", "Declined - PartnerStack"). It's now a
// fixed set of exactly these 8 values — any nuance the old free text
// carried lives in the separate "Status details" field instead.
export const AFFILIATE_STATUS_VALUES = [
  "Link acquired",
  "Approved - affiliate link active",
  "Pending approval",
  "Apply / verify",
  "Application route to verify",
  "Fallback active - no affiliate program",
  "Fallback active - Declined",
  "Fallback active - Blocked",
] as const;

export type AffiliateStatusValue = (typeof AFFILIATE_STATUS_VALUES)[number];

export function isAffiliateStatusValue(value: string): value is AffiliateStatusValue {
  return (AFFILIATE_STATUS_VALUES as readonly string[]).includes(value);
}

// The 3 groups the Marketing list page is organized around: a program
// with its real affiliate link live and working, one still being
// pursued (or running on a fallback link while that happens), and one
// with nothing to chase — no public program exists, it was declined, or
// it was blocked.
export type AffiliateStatusGroup = "ACTIVE" | "PENDING" | "NO_PROGRAM_OR_DECLINED";

const STATUS_GROUP: Record<AffiliateStatusValue, AffiliateStatusGroup> = {
  "Link acquired": "ACTIVE",
  "Approved - affiliate link active": "ACTIVE",
  "Pending approval": "PENDING",
  "Apply / verify": "PENDING",
  "Application route to verify": "PENDING",
  "Fallback active - no affiliate program": "NO_PROGRAM_OR_DECLINED",
  "Fallback active - Declined": "NO_PROGRAM_OR_DECLINED",
  "Fallback active - Blocked": "NO_PROGRAM_OR_DECLINED",
};

export function statusGroupOf(status: string | null | undefined): AffiliateStatusGroup {
  if (status && isAffiliateStatusValue(status)) return STATUS_GROUP[status];
  return "NO_PROGRAM_OR_DECLINED";
}

const STATUS_STYLE: Record<AffiliateStatusValue, { badge: string; row: string; border: string; dot: string }> = {
  "Link acquired": {
    badge: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    row: "bg-emerald-50/60",
    border: "border-l-emerald-500",
    dot: "bg-emerald-500",
  },
  "Approved - affiliate link active": {
    badge: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    row: "bg-emerald-50/60",
    border: "border-l-emerald-500",
    dot: "bg-emerald-500",
  },
  "Pending approval": {
    badge: "bg-amber-100 text-amber-800 border border-amber-300",
    row: "bg-amber-50/60",
    border: "border-l-amber-400",
    dot: "bg-amber-400",
  },
  "Apply / verify": {
    badge: "bg-indigo-100 text-indigo-800 border border-indigo-300",
    row: "bg-indigo-50/60",
    border: "border-l-indigo-400",
    dot: "bg-indigo-400",
  },
  "Application route to verify": {
    badge: "bg-slate-100 text-slate-700 border border-slate-300",
    row: "bg-slate-50/60",
    border: "border-l-slate-400",
    dot: "bg-slate-400",
  },
  "Fallback active - no affiliate program": {
    badge: "bg-orange-100 text-orange-800 border border-orange-300",
    row: "bg-orange-50/60",
    border: "border-l-orange-400",
    dot: "bg-orange-400",
  },
  "Fallback active - Declined": {
    badge: "bg-red-100 text-red-700 border border-red-300",
    row: "bg-red-50/60",
    border: "border-l-red-400",
    dot: "bg-red-400",
  },
  "Fallback active - Blocked": {
    badge: "bg-rose-100 text-rose-700 border border-rose-300",
    row: "bg-rose-50/60",
    border: "border-l-rose-500",
    dot: "bg-rose-500",
  },
};

const UNKNOWN_STATUS_STYLE = {
  badge: "bg-gray-100 text-gray-600 border border-gray-300",
  row: "bg-card-bg",
  border: "border-l-gray-300",
  dot: "bg-gray-300",
};

export function statusStyle(status: string | null | undefined): { badge: string; row: string; border: string; dot: string } {
  if (status && isAffiliateStatusValue(status)) return STATUS_STYLE[status];
  return UNKNOWN_STATUS_STYLE;
}

// Type options depend on which of the 3 tabs a program is filed under.
export const AFFILIATE_TYPE_OPTIONS: Record<string, string[]> = {
  AI_TOOLS: ["Chat Assistants", "Image & Design", "Video", "Audio", "Automation", "Writing", "Social Media", "SEO"],
  TRAINING_PROGRAMS: ["AI Training", "Affiliate Marketing", "Social Media"],
  BUSINESS_OPPORTUNITIES: ["Print-On-Demand", "Drop shipping", "Digital products", "Freelancing", "Online Businesses", "Affiliate Business"],
};
