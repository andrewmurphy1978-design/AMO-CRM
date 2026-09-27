"use client";

import { useRouter } from "next/navigation";
import {
  CALENDAR_CARD_ACCENT_BAR,
  CALENDAR_CARD_ACCENT_DOT,
  CALENDAR_CARD_BG,
  CALENDAR_METRIC_COLORS,
  CHILDREN_MOMMY_COLORS,
} from "./calendar-summary-colors";
import CalendarIcon from "./calendar-icon";
import SubCard from "./summary-sub-card";

export interface CalendarSummaryLabels {
  title: string;
  thisWeekLabel: string;
  nextWeekLabel: string;
  newLabel: string;
  businessLabel: string;
  shiftsLabel: string;
  haleyLabel: string;
  lukasLabel: string;
  mommyLabel: string;
}

export interface CalendarSummaryCounts {
  thisWeek: number;
  nextWeek: number;
  newEvents: number;
  business: number;
  shifts: number;
  haley: number;
  lukas: number;
  mommy: number;
}

export default function CalendarSummaryCard({
  connected,
  counts,
  labels,
}: {
  connected: boolean;
  counts: CalendarSummaryCounts;
  labels: CalendarSummaryLabels;
}) {
  const router = useRouter();

  function handleClick() {
    if (connected) {
      document
        .getElementById("dashboard-calendar-card")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      router.push("/calendar-app");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group relative w-full overflow-hidden rounded-2xl border border-card-border p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(2,132,199,0.15)] sm:p-5 ${CALENDAR_CARD_BG}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-[3px] ${CALENDAR_CARD_ACCENT_BAR}`}
      />
      {/* Same layout convention as the Email Summary card: title and the
          weekly count share row 1 (2 columns each, same line), the other
          4 metrics get their own single row of four below. */}
      <div className="grid grid-cols-4 items-center gap-1.5">
        <div className="col-span-2 flex items-center gap-2">
          <CalendarIcon />
          <h3 className="font-display text-lg font-semibold text-ink">
            {labels.title}
          </h3>
        </div>
        <div
          className={`col-span-2 flex items-center justify-center gap-3 rounded-lg px-2 py-2 text-center text-white ${CALENDAR_CARD_ACCENT_DOT}`}
        >
          <div>
            <span className="font-display text-xl font-bold leading-none sm:text-2xl">
              {counts.thisWeek}
            </span>
            <p className="text-[10px] font-medium leading-tight sm:text-xs">
              {labels.thisWeekLabel}
            </p>
          </div>
          <div className="h-8 w-px bg-white/30" />
          <div>
            <span className="font-display text-xl font-bold leading-none sm:text-2xl">
              {counts.nextWeek}
            </span>
            <p className="text-[10px] font-medium leading-tight sm:text-xs">
              {labels.nextWeekLabel}
            </p>
          </div>
        </div>
        <SubCard
          bg={CALENDAR_METRIC_COLORS.NEW.bg}
          text={CALENDAR_METRIC_COLORS.NEW.text}
          value={counts.newEvents}
          label={labels.newLabel}
        />
        <SubCard
          bg={CALENDAR_METRIC_COLORS.BUSINESS.bg}
          text={CALENDAR_METRIC_COLORS.BUSINESS.text}
          value={counts.business}
          label={labels.businessLabel}
        />
        <SubCard
          bg={CALENDAR_METRIC_COLORS.SHIFTS.bg}
          text={CALENDAR_METRIC_COLORS.SHIFTS.text}
          value={counts.shifts}
          label={labels.shiftsLabel}
        />
        {/* Children + Mommy share one card instead of two — split 2/3
            Banana (children) on top, 1/3 Graphite (mommy) on the bottom,
            the same colorIds their own counts are filtered by. Not a
            generic SubCard since it needs two differently-colored bands
            and 3 lines instead of one number+label pair. */}
        <div className="flex h-14 flex-col overflow-hidden rounded-lg text-center sm:h-16">
          <div
            className={`flex flex-[2] flex-col items-center justify-center gap-0.5 px-1 ${CHILDREN_MOMMY_COLORS.banana.bg} ${CHILDREN_MOMMY_COLORS.banana.text}`}
          >
            <span className="text-[9px] font-bold leading-tight sm:text-[11px]">
              {counts.haley} {labels.haleyLabel}
            </span>
            <span className="text-[9px] font-bold leading-tight sm:text-[11px]">
              {counts.lukas} {labels.lukasLabel}
            </span>
          </div>
          <div
            className={`flex flex-1 items-center justify-center px-1 ${CHILDREN_MOMMY_COLORS.graphite.bg} ${CHILDREN_MOMMY_COLORS.graphite.text}`}
          >
            <span className="text-[9px] font-bold leading-tight sm:text-[11px]">
              {counts.mommy} {labels.mommyLabel}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
