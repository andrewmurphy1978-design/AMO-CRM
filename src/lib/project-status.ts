export const PROJECT_STATUSES = [
  "PROPOSAL",
  "PLANNING",
  "BUILDING",
  "PRESENTING",
  "LAUNCHING",
  "FINAL",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ProjectStatusValue = (typeof PROJECT_STATUSES)[number];

// The first six stages count as "active" (dashboard counts, etc.).
export const ACTIVE_PROJECT_STATUSES: ProjectStatusValue[] = ["PROPOSAL", "PLANNING", "BUILDING", "PRESENTING", "LAUNCHING", "FINAL"];

// The lifecycle's "Active" stage (see project-progress.ts) is shown as one of these,
// following the phase currently under way.
export const BUILD_STAGE_STATUSES: ProjectStatusValue[] = ["BUILDING", "PRESENTING", "LAUNCHING"];

export function buildStatusForPhase(name: string): "BUILDING" | "PRESENTING" | "LAUNCHING" {
  if (/present|présent/i.test(name)) return "PRESENTING";
  if (/deploy|launch|go.?live|lancement|déploi/i.test(name)) return "LAUNCHING";
  return "BUILDING";
}

// The status of a phase that is under way, given the project's status.
export function phaseStatusFor(projectStatus: string, phaseName: string): ProjectStatusValue {
  if (BUILD_STAGE_STATUSES.includes(projectStatus as ProjectStatusValue)) return buildStatusForPhase(phaseName);
  if (projectStatus === "PROPOSAL" || projectStatus === "PLANNING" || projectStatus === "FINAL") return projectStatus;
  return "BUILDING";
}

export const PROJECT_STATUS_COLORS: Record<ProjectStatusValue, string> = {
  PROPOSAL: "bg-violet-50 text-violet-700",
  PLANNING: "bg-black/5 text-soft",
  BUILDING: "bg-emerald-50 text-emerald-700",
  PRESENTING: "bg-sky-50 text-sky-700",
  LAUNCHING: "bg-teal-50 text-teal-700",
  FINAL: "bg-orange-50 text-orange-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-sky-50 text-sky-700",
  CANCELLED: "bg-red-50 text-red-600",
};
