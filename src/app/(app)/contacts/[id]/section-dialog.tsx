"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

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
  extraWide,
  headerColorClassName,
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
  // Wider still than `wide` — for Contact Info, whose phone-extension and
  // messaging-handle fields need more horizontal room than max-w-3xl gives.
  extraWide?: boolean;
  // Opts a single dialog into the Email/Calendar-style colored header —
  // a Tailwind bg-* class (see CARD_COLORS in section-card.tsx) that
  // becomes the header bar itself, with Cancel/Save moved into it instead
  // of a separate footer. Every other dialog omits this and keeps the
  // original plain title + bottom button row.
  headerColorClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  // The success message carries the systeme.io/Google Contacts sync status
  // (see applyContactExternalSyncs) — worth surfacing even though the dialog
  // itself closes right away, so it's kept as its own toast that outlives
  // the dialog instead of being read once and discarded. Mirrors
  // contact-form.tsx's own toast idiom: derived during render by comparing
  // against the last-seen success message (React's recommended way to
  // "adjust state when a prop changes") instead of calling setState
  // synchronously inside a useEffect body.
  const [dismissed, setDismissed] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<string | undefined>(undefined);
  if (state?.success !== lastSuccess) {
    setLastSuccess(state?.success);
    setDismissed(false);
  }
  const toast = state?.success && !dismissed ? state.success : null;

  // A successful save closes the dialog — the read-only page behind it
  // re-renders from the revalidated data once Next.js applies the action's
  // revalidatePath calls.
  useEffect(() => {
    if (!state?.success) return;
    onOpenChange(false);
  }, [state, onOpenChange]);

  // The sync-status toast dismisses itself after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setDismissed(true), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open) {
    return toast ? (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-lg">{toast}</div>
    ) : null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => onOpenChange(false)}>
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl ${extraWide ? "max-w-5xl" : wide ? "max-w-3xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <form ref={formRef} action={formAction} className="flex min-h-0 flex-1 flex-col">
          {headerColorClassName ? (
            <div className={`flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white ${headerColorClassName}`}>
              <h3 className="truncate font-display text-base font-semibold sm:text-lg">{title}</h3>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-1.5 text-sm font-semibold hover:bg-white/30"
                >
                  <CancelIcon />
                  <span className="hidden sm:inline">{labels.cancel}</span>
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="btn-primary flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold disabled:opacity-60"
                >
                  <SaveIcon />
                  <span className="hidden sm:inline">{pending ? labels.saving : labels.save}</span>
                </button>
              </div>
            </div>
          ) : (
            <h3 className="shrink-0 px-5 pt-5 font-display text-lg font-semibold text-ink">{title}</h3>
          )}
          <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto p-5 ${headerColorClassName ? "" : "pt-4"}`}>
            {children}
            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
            {!headerColorClassName && (
              <div className="mt-5 flex items-center justify-end gap-3 border-t border-card-border pt-4">
                <button type="button" onClick={() => onOpenChange(false)} className="text-sm text-soft hover:underline">
                  {labels.cancel}
                </button>
                <button type="submit" disabled={pending} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60">
                  {pending ? labels.saving : labels.save}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
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
