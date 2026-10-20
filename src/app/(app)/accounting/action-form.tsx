"use client";

import { useActionState, type ReactNode } from "react";

type Result = { error?: string; success?: string };

// A form bound to one of the accounting server actions, showing its error / success message under the fields.
export default function ActionForm({
  action,
  children,
  submitLabel,
  className,
}: {
  action: (prev: Result | undefined, formData: FormData) => Promise<Result>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "flex flex-wrap items-end gap-3 text-sm"}>
      {children}
      <button disabled={pending} className="btn-primary rounded-lg px-4 py-1.5 font-semibold disabled:opacity-50">
        {pending ? "…" : submitLabel}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-soft">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "rounded-lg border border-card-border bg-white px-2 py-1.5 text-sm text-ink";
