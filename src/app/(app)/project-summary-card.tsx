"use client";

import {
  PROJECT_CARD_ACCENT_BAR,
  PROJECT_CARD_ACCENT_DOT,
  PROJECT_CARD_BG,
  PROJECT_DEADLINE_COLORS,
  PROJECT_PHASE_COLOR,
  PROJECT_TASK_COLOR,
} from "./project-summary-colors";
import ProjectsIcon from "./projects-icon";
import SubCard from "./summary-sub-card";

export interface ProjectSummaryLabels {
  title: string;
  activeProjectsLabel: string;
  activePhasesLabel: string;
  activeTasksLabel: string;
  todayLabel: string;
  tomorrowLabel: string;
  thisWeekLabel: string;
}

export interface ProjectSummaryCounts {
  activeProjects: number;
  activePhases: number;
  activeTasks: number;
  today: number;
  tomorrow: number;
  thisWeek: number;
}

export default function ProjectSummaryCard({
  counts,
  labels,
}: {
  counts: ProjectSummaryCounts;
  labels: ProjectSummaryLabels;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        document
          .getElementById("dashboard-projects-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className={`group relative w-full overflow-hidden rounded-2xl border border-card-border p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(217,119,6,0.15)] sm:p-5 ${PROJECT_CARD_BG}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-[3px] ${PROJECT_CARD_ACCENT_BAR}`}
      />
      {/* Same layout convention as the Email/Calendar/Contact Summary
          cards: title and the headline "active projects" count share row
          1; a single row of 4 cells below covers phases, tasks, and the
          Today/Tomorrow/This-week deadline composite (2 columns wide, same
          idea as the Contact Summary card's own Today/Yesterday/This-week
          card). */}
      <div className="grid grid-cols-4 items-center gap-1.5">
        <div className="col-span-2 flex items-center gap-2">
          <ProjectsIcon />
          <h3 className="font-display text-lg font-semibold text-ink">
            {labels.title}
          </h3>
        </div>
        <SubCard
          bg={PROJECT_CARD_ACCENT_DOT}
          text="text-white"
          value={counts.activeProjects}
          label={labels.activeProjectsLabel}
          layout="row"
          className="col-span-2"
        />
        <SubCard
          bg={PROJECT_PHASE_COLOR.bg}
          text={PROJECT_PHASE_COLOR.text}
          value={counts.activePhases}
          label={labels.activePhasesLabel}
        />
        <SubCard
          bg={PROJECT_TASK_COLOR.bg}
          text={PROJECT_TASK_COLOR.text}
          value={counts.activeTasks}
          label={labels.activeTasksLabel}
        />
        {/* Task deadlines — 3 equal stacked bands, one per bucket. */}
        <div className="col-span-2 flex h-14 flex-col overflow-hidden rounded-lg text-center sm:h-16">
          {(
            [
              [counts.today, PROJECT_DEADLINE_COLORS.TODAY, labels.todayLabel],
              [
                counts.tomorrow,
                PROJECT_DEADLINE_COLORS.TOMORROW,
                labels.tomorrowLabel,
              ],
              [
                counts.thisWeek,
                PROJECT_DEADLINE_COLORS.THIS_WEEK,
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
      </div>
    </button>
  );
}
