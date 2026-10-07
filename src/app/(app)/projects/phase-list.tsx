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
  supervisorId: string | null;
  startDate: string;
  dueDate: string;
  completedDate?: string;
  description: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PROPOSAL: "bg-violet-50 text-violet-700",
  PLANNING: "bg-black/5 text-soft",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  FINAL: "bg-orange-50 text-orange-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-sky-50 text-sky-700",
  CANCELLED: "bg-red-50 text-red-600",
};

const BLANK: PhaseValues = {
  name: "",
  status: "PLANNING",
  phaseType: "",
  teamMemberIds: [],
  supervisorId: "",
  startDate: "",
  dueDate: "",
  completedDate: "",
  description: "",
};

// Phases, listed as a table (name/status/type/team/dates), each row opening
// PhaseDialog to edit its full set of fields — mirrors how a Project
// itself is edited via a dedicated form rather than inline inputs.
export default function PhaseList({
  projectId,
  initialPhases,
  users,
  defaultTeamMemberIds,
  lang,
  autoEditId,
  onDone,
}: {
  projectId: string;
  initialPhases: PhaseRowData[];
  // Opens the editor on this phase right away.
  autoEditId?: string | null;
  // Editor-only mode: shows just the phase dialog (no table); called when it closes.
  onDone?: () => void;
  users: { id: string; name: string }[];
  defaultTeamMemberIds: string[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const [phases, setPhases] = useState(initialPhases);
  const [dialog, setDialog] = useState<{ phase: PhaseRowData | null } | null>(() => {
    const phase = autoEditId ? initialPhases.find((p) => p.id === autoEditId) : undefined;
    return phase ? { phase } : null;
  });

  const STATUS_LABELS = t.projectStatuses;

  function teamNamesFor(ids: string[]): string {
    const names = ids.map((id) => users.find((u) => u.id === id)?.name).filter(Boolean) as string[];
    return names.length > 0 ? names.join(", ") : "—";
  }

  function supervisorNameFor(id: string | null): string {
    return (id && users.find((u) => u.id === id)?.name) || "—";
  }

  return (
    <div>
      {!onDone && (
      <>
      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.phasesTitle}</label>
      <div className="mt-1.5">
        {phases.length === 0 ? (
          <p className="text-sm text-soft">{t.projectForm.noPhasesYet}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-card-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border bg-black/[0.02] text-left text-xs uppercase tracking-wide text-soft">
                  <th className="px-3 py-2 font-semibold">{t.phaseDialog.name}</th>
                  <th className="px-3 py-2 font-semibold">{t.phaseDialog.status}</th>
                  <th className="px-3 py-2 font-semibold">{t.phaseDialog.phaseType}</th>
                  <th className="px-3 py-2 font-semibold">{t.phaseDialog.team}</th>
                  <th className="px-3 py-2 font-semibold">{t.phaseDialog.supervisor}</th>
                  <th className="px-3 py-2 font-semibold">{t.phaseDialog.startDate}</th>
                  <th className="px-3 py-2 font-semibold">{t.phaseDialog.dueDate}</th>
                  <th className="px-3 py-2 font-semibold">{t.phaseDialog.completedDate}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {phases.map((phase) => (
                  <tr
                    key={phase.id}
                    onClick={() => setDialog({ phase })}
                    className="cursor-pointer text-ink hover:bg-black/[0.03]"
                  >
                    <td className="px-3 py-2 font-medium">{phase.name}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[phase.status]}`}>
                        {STATUS_LABELS[phase.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-soft">{phase.phaseType || "—"}</td>
                    <td className="px-3 py-2 text-soft">{teamNamesFor(phase.teamMemberIds)}</td>
                    <td className="px-3 py-2 text-soft">{supervisorNameFor(phase.supervisorId)}</td>
                    <td className="px-3 py-2 text-soft">{phase.startDate ? new Date(phase.startDate).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2 text-soft">{phase.dueDate ? new Date(phase.dueDate).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2 text-soft">{phase.completedDate ? new Date(phase.completedDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button
          type="button"
          onClick={() => setDialog({ phase: null })}
          className="mt-1.5 text-xs font-semibold text-amo-lime hover:underline"
        >
          + {t.projectForm.addPhase}
        </button>
      </div>
      </>
      )}

      {dialog && (
        <PhaseDialog
          open
          onClose={() => {
            setDialog(null);
            onDone?.();
          }}
          lang={lang}
          users={users}
          initial={
            dialog.phase
              ? {
                  name: dialog.phase.name,
                  status: dialog.phase.status,
                  phaseType: dialog.phase.phaseType ?? "",
                  teamMemberIds: dialog.phase.teamMemberIds,
                  supervisorId: dialog.phase.supervisorId ?? "",
                  startDate: dialog.phase.startDate,
                  dueDate: dialog.phase.dueDate,
                  completedDate: dialog.phase.completedDate ?? "",
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
                    ? {
                        ...r,
                        ...values,
                        phaseType: values.phaseType || null,
                        supervisorId: values.supervisorId || null,
                        description: values.description || null,
                      }
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
                    supervisorId: values.supervisorId || null,
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
