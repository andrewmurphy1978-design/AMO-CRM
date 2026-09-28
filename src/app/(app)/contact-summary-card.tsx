"use client";

import {
  CONTACT_CARD_ACCENT_BAR,
  CONTACT_CARD_ACCENT_DOT,
  CONTACT_CARD_BG,
  CONTACT_NEW_COLORS,
  CONTACT_SOURCE_COLORS,
  CONTACT_STAGE_COLORS,
} from "./contact-summary-colors";
import ContactsIcon from "./contacts-icon";
import SubCard from "./summary-sub-card";

// Fixed enum order — matches t.stages and the Prisma ContactStage enum
// itself (see prisma/schema.prisma), not the possibly-empty subset present
// in byStage, so every stage always gets its own pill even at 0.
const STAGE_ORDER = [
  "LEAD",
  "PROSPECT",
  "CLIENT",
  "PAST_CLIENT",
  "UNSUBSCRIBED",
  "PERSONAL",
] as const;

export interface ContactSummaryLabels {
  title: string;
  totalLabel: string;
  todayLabel: string;
  yesterdayLabel: string;
  thisWeekLabel: string;
  sourceSystemeIoLabel: string;
  sourceManualLabel: string;
  sourceGoogleLabel: string;
  sourceOtherLabel: string;
  stageLabels: Record<string, string>;
}

export interface ContactSummaryCounts {
  total: number;
  today: number;
  yesterday: number;
  thisWeek: number;
  bySource: {
    systemeIo: number;
    manual: number;
    google: number;
    other: number;
  };
  byStage: Record<string, number>;
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
          each, same line); the this-week new-contact buckets and the
          by-source breakdown share a second row of four. By-stage doesn't
          fit that same 4-across shape (6 stages, not 4), so it gets its
          own flex-wrap strip below instead of forcing it into the grid. */}
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
        <SubCard
          bg={CONTACT_NEW_COLORS.TODAY.bg}
          text={CONTACT_NEW_COLORS.TODAY.text}
          value={counts.today}
          label={labels.todayLabel}
        />
        <SubCard
          bg={CONTACT_NEW_COLORS.YESTERDAY.bg}
          text={CONTACT_NEW_COLORS.YESTERDAY.text}
          value={counts.yesterday}
          label={labels.yesterdayLabel}
        />
        <SubCard
          bg={CONTACT_NEW_COLORS.THIS_WEEK.bg}
          text={CONTACT_NEW_COLORS.THIS_WEEK.text}
          value={counts.thisWeek}
          label={labels.thisWeekLabel}
        />
        {/* By-source breakdown — 4 equal stacked bands (not the Calendar
            family card's 2/3+1/3 split, since no one source outweighs the
            others here), each colored by CONTACT_SOURCE_COLORS. */}
        <div className="flex h-14 flex-col overflow-hidden rounded-lg text-center sm:h-16">
          {(
            [
              ["systemeIo", labels.sourceSystemeIoLabel],
              ["manual", labels.sourceManualLabel],
              ["google", labels.sourceGoogleLabel],
              ["other", labels.sourceOtherLabel],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              className={`flex flex-1 items-center justify-center gap-0.5 px-1 ${CONTACT_SOURCE_COLORS[key].bg} ${CONTACT_SOURCE_COLORS[key].text}`}
            >
              <span className="text-[10px] font-bold leading-none">
                {counts.bySource[key]}
              </span>
              <span className="text-[7px] font-medium leading-none">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* By-stage strip — one pill per Contact stage, always all 6 in
          fixed enum order. */}
      <div className="mt-1.5 flex flex-wrap gap-1 sm:mt-2">
        {STAGE_ORDER.map((stage) => (
          <span
            key={stage}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${CONTACT_STAGE_COLORS[stage].bg} ${CONTACT_STAGE_COLORS[stage].text}`}
          >
            <span>{counts.byStage[stage] ?? 0}</span>
            <span className="font-medium">{labels.stageLabels[stage]}</span>
          </span>
        ))}
      </div>
    </button>
  );
}
