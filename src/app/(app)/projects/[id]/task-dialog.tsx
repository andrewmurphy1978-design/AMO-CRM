"use client";

import { useState, useTransition } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import type { TaskDialogValues } from "@/actions/tasks";

export type { TaskDialogValues };

// Same visual shell as PhaseDialog — used by the project-info page's "Add
// task" button so creating a task no longer needs the always-visible
// inline quick-add form.
export default function TaskDialog({
  open,
  onClose,
  initial,
  users,
  phases,
  onSave,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  initial: TaskDialogValues;
  users: { id: string; name: string }[];
  phases: { id: string; name: string }[];
  onSave: (values: TaskDialogValues) => Promise<{ error?: string } | void>;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState(initial.status);
  const [priority, setPriority] = useState(initial.priority);
  const [phaseId, setPhaseId] = useState(initial.phaseId);
  const [assigneeId, setAssigneeId] = useState(initial.assigneeId);
  const [supervisorId, setSupervisorId] = useState(initial.supervisorId);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [description, setDescription] = useState(initial.description);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const STATUSES = [
    { value: "TODO", label: t.taskStatuses.TODO },
    { value: "IN_PROGRESS", label: t.taskStatuses.IN_PROGRESS },
    { value: "BLOCKED", label: t.taskStatuses.BLOCKED },
    { value: "DONE", label: t.taskStatuses.DONE },
  ] as const;

  const PRIORITIES = [
    { value: "LOW", label: t.priorities.LOW },
    { value: "MEDIUM", label: t.priorities.MEDIUM },
    { value: "HIGH", label: t.priorities.HIGH },
    { value: "URGENT", label: t.priorities.URGENT },
  ] as const;

  function save() {
    startTransition(async () => {
      const result = await onSave({
        title,
        status,
        priority,
        phaseId,
        assigneeId,
        supervisorId,
        startDate,
        dueDate,
        description,
      });
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
        <h3 className="font-display text-lg font-semibold text-ink">{t.taskDialog.addTitle}</h3>

        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.taskForm.title}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.taskForm.status}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskDialogValues["status"])}
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
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.taskForm.priority}</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskDialogValues["priority"])}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {phases.length > 0 && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.taskForm.phase}</label>
              <select
                value={phaseId}
                onChange={(e) => setPhaseId(e.target.value)}
                className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
              >
                <option value="">{t.taskForm.noPhase}</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.taskForm.assignee}</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            >
              <option value="">{t.common.unassigned}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.taskForm.supervisor}</label>
            <select
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            >
              <option value="">{t.common.unassigned}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.taskForm.startDate}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.taskForm.dueDate}</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.taskForm.description}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-soft hover:underline">
            {t.common.cancel}
          </button>
          <button
            type="button"
            disabled={pending || !title.trim()}
            onClick={save}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
          >
            {pending ? t.common.saving : t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}
