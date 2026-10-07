"use client";

import DateInput from "@/components/date-input";
import { useState, useTransition } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import type { PhaseValues } from "@/actions/projects";
import { CARD_COLORS } from "@/components/section-card";

export type { PhaseValues };

// Same visual shell as LinkDialog (centered card over a dark backdrop),
// but for editing one Phase's own fields — a phase is a lightweight
// "sub-project", so it gets its own status/type/team/dates/description
// instead of just a name.
export default function PhaseDialog({
  open,
  onClose,
  initial,
  users,
  onSave,
  onDelete,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  initial: PhaseValues;
  users: { id: string; name: string }[];
  onSave: (values: PhaseValues) => Promise<{ error?: string } | void>;
  onDelete?: () => Promise<void>;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState(initial.status);
  const [phaseType, setPhaseType] = useState(initial.phaseType);
  const [teamMemberIds, setTeamMemberIds] = useState(initial.teamMemberIds);
  const [supervisorId, setSupervisorId] = useState(initial.supervisorId);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [completedDate, setCompletedDate] = useState(initial.completedDate ?? "");
  const [description, setDescription] = useState(initial.description);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const STATUSES = [
    { value: "PROPOSAL", label: t.projectStatuses.PROPOSAL },
    { value: "PLANNING", label: t.projectStatuses.PLANNING },
    { value: "ACTIVE", label: t.projectStatuses.ACTIVE },
    { value: "FINAL", label: t.projectStatuses.FINAL },
    { value: "ON_HOLD", label: t.projectStatuses.ON_HOLD },
    { value: "COMPLETED", label: t.projectStatuses.COMPLETED },
    { value: "CANCELLED", label: t.projectStatuses.CANCELLED },
  ] as const;

  function save() {
    startTransition(async () => {
      const result = await onSave({ name, status, phaseType, teamMemberIds, supervisorId, startDate, dueDate, completedDate, description });
      if (result?.error) setError(result.error);
      else onClose();
    });
  }

  const FIELD = "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
  const LABEL = "block text-xs font-semibold uppercase tracking-wide text-soft";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className={`flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white ${CARD_COLORS.phases}`}>
          <h3 className="truncate font-display text-lg font-semibold">{onDelete ? t.projectForm.editPhase : t.phaseDialog.addTitle}</h3>
          <div className="flex items-center gap-2">
            <button type="button" disabled={pending || !name.trim()} onClick={save} className="rounded-md bg-amo-gold px-3 py-1 text-sm font-semibold text-[#152571] shadow-sm hover:brightness-95 disabled:opacity-60">
              {pending ? t.phaseDialog.saving : t.phaseDialog.save}
            </button>
            <button type="button" onClick={onClose} aria-label={t.phaseDialog.cancel} title={t.phaseDialog.cancel} className="rounded-md px-2 py-0.5 text-lg leading-none hover:bg-white/20">
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className={LABEL}>{t.phaseDialog.name}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
            </div>

            <div>
              <label className={LABEL}>{t.phaseDialog.status}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as PhaseValues["status"])} className={FIELD}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>{t.phaseDialog.phaseType}</label>
              <input type="text" value={phaseType} onChange={(e) => setPhaseType(e.target.value)} placeholder={t.phaseDialog.phaseTypePlaceholder} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>{t.phaseDialog.supervisor}</label>
              <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className={FIELD}>
                <option value="">{t.common.unassigned}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className={LABEL}>{t.phaseDialog.team}</label>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-card-border bg-field-bg p-3">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-1.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={teamMemberIds.includes(u.id)}
                      onChange={(e) => setTeamMemberIds((prev) => (e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id)))}
                      className="h-4 w-4 rounded border-card-border accent-amo-lime"
                    />
                    {u.name}
                  </label>
                ))}
                {teamMemberIds.length === 0 && <span className="text-xs text-soft">{t.common.unassigned}</span>}
              </div>
            </div>

            <div>
              <label className={LABEL}>{t.phaseDialog.startDate}</label>
              <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>{t.phaseDialog.dueDate}</label>
              <DateInput value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>{t.phaseDialog.completedDate}</label>
              <DateInput value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} className={FIELD} />
            </div>

            <div className="sm:col-span-3">
              <label className={LABEL}>{t.phaseDialog.description}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={FIELD} />
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {onDelete && (
            <div className="mt-4">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm(t.phaseDialog.deleteConfirm)) return;
                  startTransition(async () => {
                    await onDelete();
                    onClose();
                  });
                }}
                className="text-sm text-red-600 hover:underline disabled:opacity-60"
              >
                {t.phaseDialog.delete}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
