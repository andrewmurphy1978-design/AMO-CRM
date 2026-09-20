"use client";

import { useActionState, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

type TaskFormValues = {
  title?: string;
  projectId?: string;
  phaseId?: string | null;
  description?: string | null;
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
};

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

export default function TaskForm({
  action,
  defaultValues,
  projects,
  users,
  submitLabel,
  lang,
}: {
  action: (
    prevState: { error?: string; success?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string }>;
  defaultValues?: TaskFormValues;
  projects: { id: string; label: string; phases: { id: string; name: string }[] }[];
  users: { id: string; name: string }[];
  submitLabel: string;
  lang: Lang;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = getDict(lang);

  const [projectId, setProjectId] = useState(defaultValues?.projectId ?? "");
  const phases = projects.find((p) => p.id === projectId)?.phases ?? [];

  const STATUSES = [
    { value: "TODO", label: t.taskStatuses.TODO },
    { value: "IN_PROGRESS", label: t.taskStatuses.IN_PROGRESS },
    { value: "BLOCKED", label: t.taskStatuses.BLOCKED },
    { value: "DONE", label: t.taskStatuses.DONE },
  ];

  const PRIORITIES = [
    { value: "LOW", label: t.priorities.LOW },
    { value: "MEDIUM", label: t.priorities.MEDIUM },
    { value: "HIGH", label: t.priorities.HIGH },
    { value: "URGENT", label: t.priorities.URGENT },
  ];

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={LABEL_CLASS}>{t.taskForm.title}</label>
        <input name="title" required defaultValue={defaultValues?.title} className={FIELD_CLASS} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>{t.taskForm.project}</label>
          <select
            name="projectId"
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="" disabled>
              {t.taskForm.selectProject}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.taskForm.phase}</label>
          <select name="phaseId" defaultValue={defaultValues?.phaseId ?? ""} className={FIELD_CLASS}>
            <option value="">{t.taskForm.noPhase}</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.taskForm.status}</label>
          <select name="status" defaultValue={defaultValues?.status ?? "TODO"} className={FIELD_CLASS}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.taskForm.priority}</label>
          <select name="priority" defaultValue={defaultValues?.priority ?? "MEDIUM"} className={FIELD_CLASS}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.taskForm.assignee}</label>
          <select name="assigneeId" defaultValue={defaultValues?.assigneeId ?? ""} className={FIELD_CLASS}>
            <option value="">{t.common.unassigned}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div />
        <div>
          <label className={LABEL_CLASS}>{t.taskForm.startDate}</label>
          <input type="date" name="startDate" defaultValue={toDateInput(defaultValues?.startDate)} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.taskForm.dueDate}</label>
          <input type="date" name="dueDate" defaultValue={toDateInput(defaultValues?.dueDate)} className={FIELD_CLASS} />
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS}>{t.taskForm.description}</label>
        <textarea name="description" rows={3} defaultValue={defaultValues?.description ?? ""} className={FIELD_CLASS} />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.common.saving : submitLabel}
      </button>
    </form>
  );
}

function toDateInput(value?: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
