"use client";

import { useActionState } from "react";

const STATUSES = [
  { value: "PLANNING", label: "Planning" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

type ProjectFormValues = {
  name?: string;
  contactId?: string;
  description?: string | null;
  status?: string;
  ownerId?: string | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
};

export default function ProjectForm({
  action,
  defaultValues,
  contacts,
  users,
  submitLabel,
}: {
  action: (
    prevState: { error?: string; success?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string }>;
  defaultValues?: ProjectFormValues;
  contacts: { id: string; label: string }[];
  users: { id: string; name: string }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">Project name</label>
        <input
          name="name"
          required
          defaultValue={defaultValues?.name}
          className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">Client</label>
          <select
            name="contactId"
            required
            defaultValue={defaultValues?.contactId ?? ""}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          >
            <option value="" disabled>
              Select a client...
            </option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">Status</label>
          <select
            name="status"
            defaultValue={defaultValues?.status ?? "PLANNING"}
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
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">Owner</label>
          <select
            name="ownerId"
            defaultValue={defaultValues?.ownerId ?? ""}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div />
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">Start date</label>
          <input
            type="date"
            name="startDate"
            defaultValue={toDateInput(defaultValues?.startDate)}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">Due date</label>
          <input
            type="date"
            name="dueDate"
            defaultValue={toDateInput(defaultValues?.dueDate)}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ""}
          className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
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
