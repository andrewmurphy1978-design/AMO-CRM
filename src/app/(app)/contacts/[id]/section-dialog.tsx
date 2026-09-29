"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

export interface SectionDialogLabels {
  cancel: string;
  save: string;
  saving: string;
}

// Shared modal shell for every per-card edit dialog on the Contact Info
// page — same visual pattern as projects/phase-dialog.tsx (centered card
// over a dark backdrop, click-outside/Cancel to close), but bound to a
// real server action via useActionState instead of a passed-in onSave
// callback, since these forms carry array fields (extra emails, addresses,
// tech stack rows, ...) that only a real <form action={...}> FormData
// submission parses correctly.
export default function SectionDialog({
  open,
  onOpenChange,
  title,
  action,
  labels,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  labels: SectionDialogLabels;
  children: ReactNode;
  // A handful of these cards (Addresses, Tech Stack) have enough fields
  // that the default max-w-lg panel would cramp them into a single narrow
  // column — this widens the panel instead of shrinking their grids.
  wide?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // A successful save closes the dialog — the read-only page behind it
  // re-renders from the revalidated data once Next.js applies the action's
  // revalidatePath calls, so there's nothing else this needs to do.
  useEffect(() => {
    if (state?.success) onOpenChange(false);
  }, [state, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => onOpenChange(false)}>
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-5 shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
        <form ref={formRef} action={formAction} className="mt-4 space-y-3">
          {children}
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="mt-5 flex items-center justify-end gap-3 border-t border-card-border pt-4">
            <button type="button" onClick={() => onOpenChange(false)} className="text-sm text-soft hover:underline">
              {labels.cancel}
            </button>
            <button type="submit" disabled={pending} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60">
              {pending ? labels.saving : labels.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Small pencil-icon button for a Card's header `actions` slot — every
// per-card dialog's trigger looks the same.
export function EditCardButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/20 hover:text-white"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.862 4.487 18.549 2.8a2.121 2.121 0 0 1 3 3l-1.687 1.688m-3-3L6.832 15.845a4.5 4.5 0 0 0-1.13 1.897l-.845 2.815a.75.75 0 0 0 .933.933l2.815-.845a4.5 4.5 0 0 0 1.897-1.13L19.5 8.487m-3-3 3 3"
        />
      </svg>
    </button>
  );
}

export const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
export const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";
