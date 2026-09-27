"use client";

import { useRouter } from "next/navigation";
import {
  CALENDAR_CARD_ACCENT_BAR,
  CALENDAR_CARD_ACCENT_DOT,
  CALENDAR_CARD_BG,
  CALENDAR_METRIC_COLORS,
} from "./calendar-summary-colors";
import CalendarIcon from "./calendar-icon";
import SubCard from "./summary-sub-card";

export interface CalendarSummaryLabels {
  title: string;
  thisWeekLabel: string;
  nextWeekLabel: string;
  newLabel: string;
  shiftsLabel: string;
  childrenLabel: string;
  mommyLabel: string;
}

export interface CalendarSummaryCounts {
  thisWeek: number;
  nextWeek: number;
  newEvents: number;
  shifts: number;
  children: number;
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
          bg={CALENDAR_METRIC_COLORS.SHIFTS.bg}
          text={CALENDAR_METRIC_COLORS.SHIFTS.text}
          value={counts.shifts}
          label={labels.shiftsLabel}
        />
        <SubCard
          bg={CALENDAR_METRIC_COLORS.CHILDREN.bg}
          text={CALENDAR_METRIC_COLORS.CHILDREN.text}
          value={counts.children}
          label={labels.childrenLabel}
        />
        <SubCard
          bg={CALENDAR_METRIC_COLORS.MOMMY.bg}
          text={CALENDAR_METRIC_COLORS.MOMMY.text}
          value={counts.mommy}
          label={labels.mommyLabel}
        />
      </div>
    </button>
  );
}
