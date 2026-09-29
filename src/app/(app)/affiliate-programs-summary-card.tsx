"use client";

import {
  AFFILIATE_CARD_ACCENT_BAR,
  AFFILIATE_CARD_ACCENT_DOT,
  AFFILIATE_CARD_BG,
  AFFILIATE_BUCKET_COLORS,
} from "./affiliate-summary-colors";
import AffiliateProgramsIcon from "./affiliate-programs-icon";
import SubCard from "./summary-sub-card";

export interface AffiliateProgramsSummaryLabels {
  title: string;
  totalLabel: string;
  activeLabel: string;
  pendingLabel: string;
  declinedBlockedLabel: string;
  noProgramLabel: string;
}

export interface AffiliateProgramsSummaryCounts {
  total: number;
  active: number;
  pending: number;
  declinedBlocked: number;
  noProgram: number;
}

export default function AffiliateProgramsSummaryCard({
  counts,
  labels,
}: {
  counts: AffiliateProgramsSummaryCounts;
  labels: AffiliateProgramsSummaryLabels;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        document
          .getElementById("dashboard-pending-affiliate-programs-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className={`group relative w-full overflow-hidden rounded-2xl border border-card-border p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(8,145,178,0.15)] sm:p-5 ${AFFILIATE_CARD_BG}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-[3px] ${AFFILIATE_CARD_ACCENT_BAR}`}
      />
      {/* Same layout convention as the Email/Calendar/Contact/Project
          Summary cards: title and the headline total share row 1, then a
          single row of 4 cells below covers the Active/Pending/Declined-
          blocked/No-program breakdown. */}
      <div className="grid grid-cols-4 items-center gap-1.5">
        <div className="col-span-2 flex items-center gap-2">
          <AffiliateProgramsIcon />
          <h3 className="font-display text-lg font-semibold text-ink">
            {labels.title}
          </h3>
        </div>
        <SubCard
          bg={AFFILIATE_CARD_ACCENT_DOT}
          text="text-white"
          value={counts.total}
          label={labels.totalLabel}
          layout="row"
          className="col-span-2"
        />
        <SubCard
          bg={AFFILIATE_BUCKET_COLORS.ACTIVE.bg}
          text={AFFILIATE_BUCKET_COLORS.ACTIVE.text}
          value={counts.active}
          label={labels.activeLabel}
        />
        <SubCard
          bg={AFFILIATE_BUCKET_COLORS.PENDING.bg}
          text={AFFILIATE_BUCKET_COLORS.PENDING.text}
          value={counts.pending}
          label={labels.pendingLabel}
        />
        <SubCard
          bg={AFFILIATE_BUCKET_COLORS.DECLINED_BLOCKED.bg}
          text={AFFILIATE_BUCKET_COLORS.DECLINED_BLOCKED.text}
          value={counts.declinedBlocked}
          label={labels.declinedBlockedLabel}
        />
        <SubCard
          bg={AFFILIATE_BUCKET_COLORS.NO_PROGRAM.bg}
          text={AFFILIATE_BUCKET_COLORS.NO_PROGRAM.text}
          value={counts.noProgram}
          label={labels.noProgramLabel}
        />
      </div>
    </button>
  );
}
