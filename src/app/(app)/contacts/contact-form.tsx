"use client";

import { useActionState } from "react";

const STAGES = [
  { value: "LEAD", label: "Lead" },
  { value: "PROSPECT", label: "Prospect" },
  { value: "CLIENT", label: "Client" },
  { value: "PAST_CLIENT", label: "Past client" },
  { value: "UNSUBSCRIBED", label: "Unsubscribed" },
];

type ContactFormValues = {
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  company?: string | null;
  city?: string | null;
  country?: string | null;
  stage?: string;
  notes?: string | null;
};

export default function ContactForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (
    prevState: { error?: string; success?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string }>;
  defaultValues?: ContactFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" type="email" required defaultValue={defaultValues?.email} />
        <Field
          label="Stage"
          name="stage"
          as="select"
          defaultValue={defaultValues?.stage ?? "LEAD"}
          options={STAGES}
        />
        <Field label="First name" name="firstName" defaultValue={defaultValues?.firstName ?? ""} />
        <Field label="Last name" name="lastName" defaultValue={defaultValues?.lastName ?? ""} />
        <Field label="Phone" name="phone" defaultValue={defaultValues?.phone ?? ""} />
        <Field label="Company" name="company" defaultValue={defaultValues?.company ?? ""} />
        <Field label="City" name="city" defaultValue={defaultValues?.city ?? ""} />
        <Field label="Country" name="country" defaultValue={defaultValues?.country ?? ""} />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Notes</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes ?? ""}
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

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  as,
  options,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | null;
  as?: "select";
  options?: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {as === "select" ? (
        <select
          id={name}
          name={name}
          defaultValue={defaultValue ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        >
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        />
      )}
    </div>
  );
}
