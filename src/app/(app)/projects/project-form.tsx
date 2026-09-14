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
        <label className="block text-sm font-medium text-slate-700">Project name</label>
        <input
          name="name"
          required
          defaultValue={defaultValues?.name}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Client</label>
          <select
            name="contactId"
            required
            defaultValue={defaultValues?.contactId ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
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
          <label className="block text-sm font-medium text-slate-700">Status</label>
          <select
            name="status"
            defaultValue={defaultValues?.status ?? "PLANNING"}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Owner</label>
          <select
            name="ownerId"
            defaultValue={defaultValues?.ownerId ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
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
          <label className="block text-sm font-medium text-slate-700">Start date</label>
          <input
            type="date"
            name="startDate"
            defaultValue={toDateInput(defaultValues?.startDate)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Due date</label>
          <input
            type="date"
            name="dueDate"
            defaultValue={toDateInput(defaultValues?.dueDate)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
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
