"use client";

import type { SocialSummaryCounts } from "@/lib/social";
import {
  SOCIAL_CARD_ACCENT_BAR,
  SOCIAL_CARD_ACCENT_DOT,
  SOCIAL_CARD_BG,
  SOCIAL_GROWTH_COLORS,
  SOCIAL_METRIC_COLORS,
} from "./social-summary-colors";
import SocialIcon from "./social-icon";
import SubCard from "./summary-sub-card";

export interface SocialSummaryLabels {
  title: string;
  followersLabel: string;
  growthLabel: string;
  engagementLabel: string;
  viewsLabel: string;
  platformsLabel: string;
}

export default function SocialAnalyticsSummaryCard({
  counts,
  labels,
}: {
  counts: SocialSummaryCounts;
  labels: SocialSummaryLabels;
}) {
  const growth = counts.followersGrowth;
  const growthColor =
    growth > 0 ? SOCIAL_GROWTH_COLORS.positive : growth < 0 ? SOCIAL_GROWTH_COLORS.negative : SOCIAL_GROWTH_COLORS.flat;
  const growthValue = growth > 0 ? `+${growth.toLocaleString()}` : growth.toLocaleString();

  return (
    <button
      type="button"
      onClick={() => {
        document
          .getElementById("dashboard-social-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className={`group relative w-full overflow-hidden rounded-2xl border border-card-border p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(219,39,119,0.15)] sm:p-5 ${SOCIAL_CARD_BG}`}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${SOCIAL_CARD_ACCENT_BAR}`} />
      {/* Same layout convention as the Email/Calendar/Contact/Project/
          Affiliate Summary cards: title and the headline total share row 1,
          then a single row of 4 cells below covers the breakdown. */}
      <div className="grid grid-cols-4 items-center gap-1.5">
        <div className="col-span-2 flex items-center gap-2">
          <SocialIcon />
          <h3 className="font-display text-lg font-semibold text-ink">
            {labels.title}
          </h3>
        </div>
        <SubCard
          bg={SOCIAL_CARD_ACCENT_DOT}
          text="text-white"
          value={counts.totalFollowers.toLocaleString()}
          label={labels.followersLabel}
          layout="row"
          className="col-span-2"
        />
        <SubCard
          bg={growthColor.bg}
          text={growthColor.text}
          value={growthValue}
          label={labels.growthLabel}
        />
        <SubCard
          bg={SOCIAL_METRIC_COLORS.engagement.bg}
          text={SOCIAL_METRIC_COLORS.engagement.text}
          value={counts.totalEngagement.toLocaleString()}
          label={labels.engagementLabel}
        />
        <SubCard
          bg={SOCIAL_METRIC_COLORS.views.bg}
          text={SOCIAL_METRIC_COLORS.views.text}
          value={counts.totalViews.toLocaleString()}
          label={labels.viewsLabel}
        />
        <SubCard
          bg={SOCIAL_METRIC_COLORS.platforms.bg}
          text={SOCIAL_METRIC_COLORS.platforms.text}
          value={`${counts.platformsTracked}/${counts.platformsTotal}`}
          label={labels.platformsLabel}
        />
      </div>
    </button>
  );
}
