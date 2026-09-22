"use client";

import { useState, useTransition } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import type { PhaseValues } from "@/actions/projects";
import MultiSelect from "@/components/multi-select";

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
  const [startDate, setStartDate] = useState(initial.startDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [description, setDescription] = useState(initial.description);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const STATUSES = [
    { value: "PLANNING", label: t.projectStatuses.PLANNING },
    { value: "ACTIVE", label: t.projectStatuses.ACTIVE },
    { value: "ON_HOLD", label: t.projectStatuses.ON_HOLD },
    { value: "COMPLETED", label: t.projectStatuses.COMPLETED },
    { value: "CANCELLED", label: t.projectStatuses.CANCELLED },
  ] as const;

  function save() {
    startTransition(async () => {
      const result = await onSave({ name, status, phaseType, teamMemberIds, startDate, dueDate, description });
      if (result?.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-card-border bg-card-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-semibold text-ink">
          {onDelete ? t.projectForm.editPhase : t.phaseDialog.addTitle}
        </h3>

        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.phaseDialog.name}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.phaseDialog.status}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PhaseValues["status"])}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.phaseDialog.phaseType}</label>
            <input
              type="text"
              value={phaseType}
              onChange={(e) => setPhaseType(e.target.value)}
              placeholder={t.phaseDialog.phaseTypePlaceholder}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.phaseDialog.team}</label>
          <div className="mt-1">
            <MultiSelect
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              selected={teamMemberIds}
              placeholder={t.phaseDialog.selectTeamMembers}
              onChange={setTeamMemberIds}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.phaseDialog.startDate}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.phaseDialog.dueDate}</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.phaseDialog.description}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          {onDelete ? (
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
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="text-sm text-soft hover:underline">
              {t.phaseDialog.cancel}
            </button>
            <button
              type="button"
              disabled={pending || !name.trim()}
              onClick={save}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
            >
              {pending ? t.phaseDialog.saving : t.phaseDialog.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
