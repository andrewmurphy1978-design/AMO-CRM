"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import Card, { CARD_COLORS } from "@/components/section-card";
import { EditCardButton } from "../../contacts/[id]/section-dialog";
import PhaseList, { type PhaseRowData } from "../phase-list";

const STATUS_COLORS: Record<string, string> = {
  PROPOSAL: "bg-violet-50 text-violet-700",
  PLANNING: "bg-black/5 text-soft",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  FINAL: "bg-orange-50 text-orange-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-sky-50 text-sky-700",
  CANCELLED: "bg-red-50 text-red-600",
};

// The project page's Phases card: a read-only table, with a pencil that
// opens the phase editor (add, change or delete phases) in its own dialog.
export default function PhasesCard({
  projectId,
  phases,
  users,
  defaultTeamMemberIds,
  selectedPhaseId,
  lang,
  summary,
}: {
  projectId: string;
  phases: PhaseRowData[];
  users: { id: string; name: string }[];
  defaultTeamMemberIds: string[];
  selectedPhaseId: string | null;
  lang: Lang;
  // The active phase's summary (progress, open tasks), shown at the top of this card.
  summary?: ReactNode;
}) {
  const t = getDict(lang);
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The full phases table stays folded away under the progress bar; open it to see or pick a phase.
  const [showTable, setShowTable] = useState(false);
  const fmt = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" }) : "—");
  const names = (ids: string[]) => ids.map((id) => users.find((u) => u.id === id)?.name).filter(Boolean).join(", ") || "—";

  // Click a phase to focus the page on it; click it again to see everything.
  function selectPhase(id: string) {
    router.push(id === selectedPhaseId ? `${pathname}?phase=all` : `${pathname}?phase=${id}`, { scroll: false });
  }

  function close() {
    setOpen(false);
    router.refresh();
  }

  return (
    <Card
      color="phases"
      title={
        <>
          {t.projectForm.phasesTitle}
          {phases.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{phases.length}</span>
          )}
        </>
      }
      compact
      actions={<EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />}
    >
      {summary && <div className="mb-3 border-b border-card-border pb-3">{summary}</div>}
      {selectedPhaseId && (
        <p className="mb-2 flex items-center gap-2 text-xs text-soft">
          {lang === "fr" ? "Page filtrée sur la phase sélectionnée." : "Page filtered to the selected phase."}
          <button type="button" onClick={() => selectPhase(selectedPhaseId)} className="font-semibold text-emerald-700 hover:underline">
            {lang === "fr" ? "Tout afficher" : "Show all"}
          </button>
        </p>
      )}
      {phases.length === 0 ? (
        <p className="text-sm text-soft">{t.projectForm.noPhasesYet}</p>
      ) : !showTable ? (
        <button type="button" onClick={() => setShowTable(true)} className="text-xs font-semibold text-emerald-700 hover:underline">
          {lang === "fr" ? `▸ Afficher les ${phases.length} phases` : `▸ Show all ${phases.length} phases`}
        </button>
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
                  onClick={() => selectPhase(phase.id)}
                  title={lang === "fr" ? "Filtrer la page sur cette phase" : "Show only this phase on the page"}
                  className={`cursor-pointer text-ink hover:bg-black/5 ${phase.id === selectedPhaseId ? "bg-amo-lime/15 outline outline-2 -outline-offset-2 outline-amo-lime" : ""}`}
                >
                  <td className="px-3 py-2 font-medium">{phase.name}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[phase.status]}`}>{t.projectStatuses[phase.status]}</span>
                  </td>
                  <td className="px-3 py-2 text-soft">{phase.phaseType || "—"}</td>
                  <td className="px-3 py-2 text-soft">{names(phase.teamMemberIds)}</td>
                  <td className="px-3 py-2 text-soft">{(phase.supervisorId && users.find((u) => u.id === phase.supervisorId)?.name) || "—"}</td>
                  <td className="px-3 py-2 text-soft">{fmt(phase.startDate)}</td>
                  <td className="px-3 py-2 text-soft">{fmt(phase.dueDate)}</td>
                  <td className="px-3 py-2 text-soft">{fmt(phase.completedDate ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => setShowTable(false)} className="m-2 text-xs font-semibold text-soft hover:underline">
            {lang === "fr" ? "▾ Masquer les phases" : "▾ Hide the phases"}
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={close}>
          <div
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex shrink-0 items-center justify-between gap-3 px-3 py-2.5 text-white sm:px-4 sm:py-3 ${CARD_COLORS.phases}`}>
              <h3 className="truncate font-display text-base font-semibold sm:text-lg">{t.projectForm.phasesTitle}</h3>
              <button type="button" onClick={close} className="rounded-md bg-white/20 px-3 py-1.5 text-sm font-semibold hover:bg-white/30">
                {t.tagManager.done}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
              <PhaseList projectId={projectId} initialPhases={phases} users={users} defaultTeamMemberIds={defaultTeamMemberIds} lang={lang} />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
