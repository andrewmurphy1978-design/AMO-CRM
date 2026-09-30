"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import Card, { CARD_COLORS } from "@/components/section-card";
import { EditCardButton } from "../../contacts/[id]/section-dialog";
import PhaseList, { type PhaseRowData } from "../phase-list";

const STATUS_COLORS: Record<string, string> = {
  PLANNING: "bg-black/5 text-soft",
  ACTIVE: "bg-emerald-50 text-emerald-700",
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
  lang,
}: {
  projectId: string;
  phases: PhaseRowData[];
  users: { id: string; name: string }[];
  defaultTeamMemberIds: string[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fmt = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" }) : "—");
  const names = (ids: string[]) => ids.map((id) => users.find((u) => u.id === id)?.name).filter(Boolean).join(", ") || "—";

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
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {phases.map((phase) => (
                <tr key={phase.id} className="text-ink">
                  <td className="px-3 py-2 font-medium">{phase.name}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[phase.status]}`}>{t.projectStatuses[phase.status]}</span>
                  </td>
                  <td className="px-3 py-2 text-soft">{phase.phaseType || "—"}</td>
                  <td className="px-3 py-2 text-soft">{names(phase.teamMemberIds)}</td>
                  <td className="px-3 py-2 text-soft">{(phase.supervisorId && users.find((u) => u.id === phase.supervisorId)?.name) || "—"}</td>
                  <td className="px-3 py-2 text-soft">{fmt(phase.startDate)}</td>
                  <td className="px-3 py-2 text-soft">{fmt(phase.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
