"use client";

import {
  AUTOMATIONS_CARD_ACCENT_BAR,
  AUTOMATIONS_CARD_ACCENT_DOT,
  AUTOMATIONS_CARD_BG,
  AUTOMATIONS_BUCKET_COLORS,
} from "./automations-summary-colors";
import AutomationsIcon from "./automations-icon";
import SubCard from "./summary-sub-card";

export interface AutomationsSummaryLabels {
  title: string;
  totalLabel: string;
  successLabel: string;
  failedLabel: string;
  makeLabel: string;
  zapierLabel: string;
}

export interface AutomationsSummaryCounts {
  total: number;
  success: number;
  failed: number;
  make: number;
  zapier: number;
}

export default function AutomationsSummaryCard({
  counts,
  labels,
}: {
  counts: AutomationsSummaryCounts;
  labels: AutomationsSummaryLabels;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        // Desktop and mobile each render their own instance of the
        // Automations card at a different DOM position (see page.tsx), so
        // each needs its own id — this picks whichever one is actually on
        // screen, matching the same lg (1024px) breakpoint that switches
        // between the two instances there.
        const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
        document
          .getElementById(isDesktop ? "dashboard-automations-card-desktop" : "dashboard-automations-card-mobile")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className={`group relative w-full overflow-hidden rounded-2xl border border-card-border p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(124,58,237,0.15)] sm:p-5 ${AUTOMATIONS_CARD_BG}`}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${AUTOMATIONS_CARD_ACCENT_BAR}`} />
      {/* Same layout convention as the Email/Calendar/Contact/Project/
          Affiliate/Social Summary cards: title and the headline total
          share row 1, then a single row of 4 cells below covers the
          breakdown. */}
      <div className="grid grid-cols-4 items-center gap-1.5">
        <div className="col-span-2 flex items-center gap-2">
          <AutomationsIcon />
          <h3 className="font-display text-lg font-semibold text-ink">
            {labels.title}
          </h3>
        </div>
        <SubCard
          bg={AUTOMATIONS_CARD_ACCENT_DOT}
          text="text-white"
          value={counts.total}
          label={labels.totalLabel}
          layout="row"
          className="col-span-2"
        />
        <SubCard
          bg={AUTOMATIONS_BUCKET_COLORS.SUCCESS.bg}
          text={AUTOMATIONS_BUCKET_COLORS.SUCCESS.text}
          value={counts.success}
          label={labels.successLabel}
        />
        <SubCard
          bg={AUTOMATIONS_BUCKET_COLORS.FAILED.bg}
          text={AUTOMATIONS_BUCKET_COLORS.FAILED.text}
          value={counts.failed}
          label={labels.failedLabel}
        />
        <SubCard
          bg={AUTOMATIONS_BUCKET_COLORS.MAKE.bg}
          text={AUTOMATIONS_BUCKET_COLORS.MAKE.text}
          value={counts.make}
          label={labels.makeLabel}
        />
        <SubCard
          bg={AUTOMATIONS_BUCKET_COLORS.ZAPIER.bg}
          text={AUTOMATIONS_BUCKET_COLORS.ZAPIER.text}
          value={counts.zapier}
          label={labels.zapierLabel}
        />
      </div>
    </button>
  );
}
