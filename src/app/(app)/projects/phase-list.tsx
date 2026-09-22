"use client";

import { useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { createPhase, updatePhase, deletePhase, type PhaseValues } from "@/actions/projects";
import PhaseDialog from "./phase-dialog";

export interface PhaseRowData {
  id: string;
  name: string;
  status: PhaseValues["status"];
  phaseType: string | null;
  teamMemberIds: string[];
  startDate: string;
  dueDate: string;
  description: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PLANNING: "bg-black/5 text-soft",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-sky-50 text-sky-700",
  CANCELLED: "bg-red-50 text-red-600",
};

const BLANK: PhaseValues = {
  name: "",
  status: "PLANNING",
  phaseType: "",
  teamMemberIds: [],
  startDate: "",
  dueDate: "",
  description: "",
};

// Phases, listed as small cards (name + status pill), each opening
// PhaseDialog to edit its full set of fields — mirrors how a Project
// itself is edited via a dedicated form rather than inline inputs.
export default function PhaseList({
  projectId,
  initialPhases,
  users,
  defaultTeamMemberIds,
  lang,
}: {
  projectId: string;
  initialPhases: PhaseRowData[];
  users: { id: string; name: string }[];
  defaultTeamMemberIds: string[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const [phases, setPhases] = useState(initialPhases);
  const [dialog, setDialog] = useState<{ phase: PhaseRowData | null } | null>(null);

  const STATUS_LABELS = t.projectStatuses;

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.phasesTitle}</label>
      <div className="mt-1 space-y-1.5">
        {phases.length === 0 && <p className="text-sm text-soft">{t.projectForm.noPhasesYet}</p>}
        {phases.map((phase) => (
          <button
            key={phase.id}
            type="button"
            onClick={() => setDialog({ phase })}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-card-border bg-field-bg px-3 py-2 text-left text-sm text-ink shadow-sm hover:bg-black/[0.03]"
          >
            <span className="truncate">{phase.name}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[phase.status]}`}>
              {STATUS_LABELS[phase.status]}
            </span>
          </button>
        ))}
        <button type="button" onClick={() => setDialog({ phase: null })} className="text-xs font-semibold text-amo-lime hover:underline">
          + {t.projectForm.addPhase}
        </button>
      </div>

      {dialog && (
        <PhaseDialog
          open
          onClose={() => setDialog(null)}
          lang={lang}
          users={users}
          initial={
            dialog.phase
              ? {
                  name: dialog.phase.name,
                  status: dialog.phase.status,
                  phaseType: dialog.phase.phaseType ?? "",
                  teamMemberIds: dialog.phase.teamMemberIds,
                  startDate: dialog.phase.startDate,
                  dueDate: dialog.phase.dueDate,
                  description: dialog.phase.description ?? "",
                }
              : { ...BLANK, teamMemberIds: defaultTeamMemberIds }
          }
          onSave={async (values) => {
            if (dialog.phase) {
              const result = await updatePhase(dialog.phase.id, projectId, values);
              if (result?.error) return result;
              setPhases((rows) =>
                rows.map((r) =>
                  r.id === dialog.phase!.id
                    ? { ...r, ...values, phaseType: values.phaseType || null, description: values.description || null }
                    : r
                )
              );
            } else {
              const result = await createPhase(projectId, phases.length, values);
              if (result.error) return result;
              if (result.id) {
                const newId = result.id;
                setPhases((rows) => [
                  ...rows,
                  {
                    id: newId,
                    ...values,
                    phaseType: values.phaseType || null,
                    description: values.description || null,
                  },
                ]);
              }
            }
          }}
          onDelete={
            dialog.phase
              ? async () => {
                  await deletePhase(dialog.phase!.id, projectId);
                  setPhases((rows) => rows.filter((r) => r.id !== dialog.phase!.id));
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
