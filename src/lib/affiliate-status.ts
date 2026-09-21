// The "Affiliate Status" column in the source spreadsheet used dozens of
// free-text variants (e.g. "Fallback active — apply via Impact",
// "Declined - PartnerStack"). We bucket them into the handful of
// colour-coded categories the sheet actually distinguished by colour, so
// every row still gets a meaningful colour even when its exact wording
// isn't one of the canonical six.
export type AffiliateStatusBucket =
  | "APPROVED_LIVE"
  | "PENDING_APPROVAL"
  | "PARTNER_TO_VERIFY"
  | "FALLBACK_ACTIVE"
  | "FALLBACK_NO_PUBLIC_PROGRAM"
  | "DECLINED"
  | "OTHER";

export function classifyAffiliateStatus(status: string | null | undefined): AffiliateStatusBucket {
  if (!status) return "OTHER";
  const s = status.toLowerCase();

  if (s.includes("declined") || s.includes("ineligible") || s.includes("blocked")) return "DECLINED";
  if (s.includes("approved") || s.includes("affiliate link active") || s.includes("link acquired")) return "APPROVED_LIVE";
  if (s.includes("referral")) return "PARTNER_TO_VERIFY";
  if (
    s.includes("no public affiliate program") ||
    s.includes("no separate public program") ||
    s.includes("no affiliate offer") ||
    s.includes("no affiliate program identified")
  )
    return "FALLBACK_NO_PUBLIC_PROGRAM";
  if (s.includes("fallback")) return "FALLBACK_ACTIVE";
  if (s.includes("pending") || s.includes("apply") || s.includes("application") || s.includes("clarification") || s.includes("provider-specific"))
    return "PENDING_APPROVAL";

  return "OTHER";
}

export const AFFILIATE_STATUS_BUCKETS: AffiliateStatusBucket[] = [
  "APPROVED_LIVE",
  "PENDING_APPROVAL",
  "PARTNER_TO_VERIFY",
  "FALLBACK_ACTIVE",
  "FALLBACK_NO_PUBLIC_PROGRAM",
  "DECLINED",
  "OTHER",
];

export const AFFILIATE_STATUS_STYLES: Record<AffiliateStatusBucket, { badge: string; row: string; border: string; dot: string }> = {
  APPROVED_LIVE: {
    badge: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    row: "bg-emerald-50/60",
    border: "border-l-emerald-500",
    dot: "bg-emerald-500",
  },
  PENDING_APPROVAL: {
    badge: "bg-amber-100 text-amber-800 border border-amber-300",
    row: "bg-amber-50/60",
    border: "border-l-amber-400",
    dot: "bg-amber-400",
  },
  PARTNER_TO_VERIFY: {
    badge: "bg-indigo-100 text-indigo-800 border border-indigo-300",
    row: "bg-indigo-50/60",
    border: "border-l-indigo-400",
    dot: "bg-indigo-400",
  },
  FALLBACK_ACTIVE: {
    badge: "bg-slate-100 text-slate-700 border border-slate-300",
    row: "bg-slate-50/60",
    border: "border-l-slate-400",
    dot: "bg-slate-400",
  },
  FALLBACK_NO_PUBLIC_PROGRAM: {
    badge: "bg-orange-100 text-orange-800 border border-orange-300",
    row: "bg-orange-50/60",
    border: "border-l-orange-400",
    dot: "bg-orange-400",
  },
  DECLINED: {
    badge: "bg-red-100 text-red-700 border border-red-300",
    row: "bg-red-50/60",
    border: "border-l-red-400",
    dot: "bg-red-400",
  },
  OTHER: {
    badge: "bg-gray-100 text-gray-600 border border-gray-300",
    row: "bg-card-bg",
    border: "border-l-gray-300",
    dot: "bg-gray-300",
  },
};
