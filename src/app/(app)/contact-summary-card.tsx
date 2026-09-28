"use client";

import {
  CONTACT_CARD_ACCENT_BAR,
  CONTACT_CARD_ACCENT_DOT,
  CONTACT_CARD_BG,
  CONTACT_NEW_COLORS,
  CONTACT_SOURCE_COLORS,
  CONTACT_STAGE_GROUP_COLORS,
} from "./contact-summary-colors";
import ContactsIcon from "./contacts-icon";
import SubCard from "./summary-sub-card";

export interface ContactSummaryLabels {
  title: string;
  totalLabel: string;
  todayLabel: string;
  yesterdayLabel: string;
  thisWeekLabel: string;
  sourceSystemeIoLabel: string;
  sourceGoogleLabel: string;
  activeStageLabel: string;
  inactiveStageLabel: string;
}

export interface ContactSummaryCounts {
  total: number;
  today: number;
  yesterday: number;
  thisWeek: number;
  bySource: {
    systemeIo: number;
    google: number;
  };
  // Sums across the 6 ContactStage values — LEAD+PROSPECT+CLIENT
  // ("active" pipeline) and PAST_CLIENT+UNSUBSCRIBED+PERSONAL
  // ("inactive") — computed by the caller (page.tsx).
  activeStageCount: number;
  inactiveStageCount: number;
}

export default function ContactSummaryCard({
  counts,
  labels,
}: {
  counts: ContactSummaryCounts;
  labels: ContactSummaryLabels;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        document
          .getElementById("dashboard-contacts-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className={`group relative w-full overflow-hidden rounded-2xl border border-card-border p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(192,38,211,0.15)] sm:p-5 ${CONTACT_CARD_BG}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-[3px] ${CONTACT_CARD_ACCENT_BAR}`}
      />
      {/* Same layout convention as the Email/Calendar Summary cards: title
          and the headline "total contacts" count share row 1 (2 columns
          each, same line); a single row of 4 cells below covers everything
          else — the new-contact buckets and the by-source breakdown are
          each one composite card (multiple colored lines stacked in a
          fixed-height tile, same idea as the Calendar Summary card's own
          Haley/Lukas/Mom card), and the two stage groups are plain
          single-value SubCards. */}
      <div className="grid grid-cols-4 items-center gap-1.5">
        <div className="col-span-2 flex items-center gap-2">
          <ContactsIcon />
          <h3 className="font-display text-lg font-semibold text-ink">
            {labels.title}
          </h3>
        </div>
        <SubCard
          bg={CONTACT_CARD_ACCENT_DOT}
          text="text-white"
          value={counts.total}
          label={labels.totalLabel}
          layout="row"
          className="col-span-2"
        />
        {/* New contacts — 3 equal stacked bands, one per bucket. */}
        <div className="flex h-14 flex-col overflow-hidden rounded-lg text-center sm:h-16">
          {(
            [
              [counts.today, CONTACT_NEW_COLORS.TODAY, labels.todayLabel],
              [
                counts.yesterday,
                CONTACT_NEW_COLORS.YESTERDAY,
                labels.yesterdayLabel,
              ],
              [
                counts.thisWeek,
                CONTACT_NEW_COLORS.THIS_WEEK,
                labels.thisWeekLabel,
              ],
            ] as const
          ).map(([value, color, label], i) => (
            <div
              key={i}
              className={`flex flex-1 items-center justify-center gap-0.5 px-1 ${color.bg} ${color.text}`}
            >
              <span className="text-[10px] font-bold leading-none">
                {value}
              </span>
              <span className="text-[7px] font-medium leading-none">
                {label}
              </span>
            </div>
          ))}
        </div>
        {/* By-source — only systeme.io and Google Contacts are broken out
            (manual entries and anything else still count toward the total
            above, just not shown here). */}
        <div className="flex h-14 flex-col overflow-hidden rounded-lg text-center sm:h-16">
          {(
            [
              [
                counts.bySource.systemeIo,
                CONTACT_SOURCE_COLORS.systemeIo,
                labels.sourceSystemeIoLabel,
              ],
              [
                counts.bySource.google,
                CONTACT_SOURCE_COLORS.google,
                labels.sourceGoogleLabel,
              ],
            ] as const
          ).map(([value, color, label], i) => (
            <div
              key={i}
              className={`flex flex-1 items-center justify-center gap-0.5 px-1 ${color.bg} ${color.text}`}
            >
              <span className="text-xs font-bold leading-none">{value}</span>
              <span className="text-[9px] font-medium leading-none">
                {label}
              </span>
            </div>
          ))}
        </div>
        <SubCard
          bg={CONTACT_STAGE_GROUP_COLORS.active.bg}
          text={CONTACT_STAGE_GROUP_COLORS.active.text}
          value={counts.activeStageCount}
          label={labels.activeStageLabel}
        />
        <SubCard
          bg={CONTACT_STAGE_GROUP_COLORS.inactive.bg}
          text={CONTACT_STAGE_GROUP_COLORS.inactive.text}
          value={counts.inactiveStageCount}
          label={labels.inactiveStageLabel}
        />
      </div>
    </button>
  );
}
