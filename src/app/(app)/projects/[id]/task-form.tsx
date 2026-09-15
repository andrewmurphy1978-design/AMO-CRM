"use client";

import { useActionState } from "react";

const STATUSES = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
];

const PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

type TaskFormValues = {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  dueDate?: Date | string | null;
};

export default function TaskForm({
  action,
  projectId,
  defaultValues,
  users,
  submitLabel,
}: {
  action: (
    prevState: { error?: string; success?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string }>;
  projectId: string;
  defaultValues?: TaskFormValues;
  users: { id: string; name: string }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">Title</label>
        <input
          name="title"
          required
          defaultValue={defaultValues?.title}
          className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">Status</label>
          <select
            name="status"
            defaultValue={defaultValues?.status ?? "TODO"}
            className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">Priority</label>
          <select
            name="priority"
            defaultValue={defaultValues?.priority ?? "MEDIUM"}
            className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">Assignee</label>
          <select
            name="assigneeId"
            defaultValue={defaultValues?.assigneeId ?? ""}
            className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">Due date</label>
          <input
            type="date"
            name="dueDate"
            defaultValue={toDateInput(defaultValues?.dueDate)}
            className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-amo-muted">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ""}
          className="mt-1 w-full rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
        />
      </div>

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state?.success && <p className="text-sm text-amo-lime">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-gradient-to-r from-amo-lime to-amo-teal px-4 py-2 text-sm font-semibold text-amo-green shadow-[0_4px_14px_rgba(46,204,113,0.25)] transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        {pending ? "Saving..." : submitLabel}
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
