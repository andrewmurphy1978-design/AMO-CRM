"use client";

import { useActionState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { logInteraction, deleteInteraction } from "@/actions/interactions";

const TYPE_OPTIONS = [
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Meeting" },
  { value: "NOTE", label: "Note" },
] as const;

const TYPE_STYLES: Record<string, { dot: string; badge: string; icon: React.ReactNode }> = {
  CALL: {
    dot: "bg-amo-teal",
    badge: "bg-amo-teal/15 text-amo-teal",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6.75c0 8.284 6.716 15 15 15h1.5a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
      />
    ),
  },
  EMAIL: {
    dot: "bg-amo-blue",
    badge: "bg-amo-blue/15 text-amo-blue",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
      />
    ),
  },
  MEETING: {
    dot: "bg-amo-gold",
    badge: "bg-amo-gold/15 text-amo-gold",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
      />
    ),
  },
  NOTE: {
    dot: "bg-amo-lime",
    badge: "bg-amo-lime/15 text-amo-lime",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487 18.549 2.8a2.121 2.121 0 0 1 3 3l-1.687 1.688m-3-3L6.832 15.845a4.5 4.5 0 0 0-1.13 1.897l-.845 2.815a.75.75 0 0 0 .933.933l2.815-.845a4.5 4.5 0 0 0 1.897-1.13L19.5 8.487m-3-3 3 3"
      />
    ),
  },
};

export type InteractionEntry = {
  id: string;
  type: string;
  subject: string | null;
  notes: string;
  occurredAt: string;
  loggedBy: { name: string } | null;
  project?: { id: string; name: string } | null;
};

export default function InteractionLog({
  contactId,
  projectId,
  interactions,
}: {
  contactId: string;
  projectId?: string;
  interactions: InteractionEntry[];
}) {
  const [state, formAction, pending] = useActionState(logInteraction, undefined);
  const [, startTransition] = useTransition();

  return (
    <div>
      <form action={formAction} className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <input type="hidden" name="contactId" value={contactId} />
        {projectId && <input type="hidden" name="projectId" value={projectId} />}

        <select
          name="type"
          defaultValue="CALL"
          className="rounded-lg border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          name="subject"
          placeholder="Subject (optional)"
          className="rounded-lg border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
        />

        <textarea
          name="notes"
          required
          rows={2}
          placeholder="What was discussed..."
          className="sm:col-span-2 rounded-lg border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
        />

        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-gradient-to-r from-amo-lime to-amo-teal px-4 py-2 text-sm font-semibold text-amo-green shadow-[0_4px_14px_rgba(46,204,113,0.25)] transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {pending ? "Logging..." : "Log interaction"}
          </button>
          {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        </div>
      </form>

      <ul className="mt-5 space-y-4">
        {interactions.map((entry) => {
          const style = TYPE_STYLES[entry.type] ?? TYPE_STYLES.NOTE;
          return (
            <li key={entry.id} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.badge}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
                  {style.icon}
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.badge}`}>
                    {TYPE_OPTIONS.find((o) => o.value === entry.type)?.label ?? entry.type}
                  </span>
                  {entry.subject && <p className="text-sm font-medium text-amo-white">{entry.subject}</p>}
                  {entry.project && (
                    <span className="text-xs text-amo-muted">· {entry.project.name}</span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-amo-white">{entry.notes}</p>
                <p className="mt-1 text-xs text-amo-muted">
                  {formatDistanceToNow(new Date(entry.occurredAt), { addSuffix: true })}
                  {entry.loggedBy && ` · ${entry.loggedBy.name}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  startTransition(() => deleteInteraction(entry.id, contactId, projectId ?? null))
                }
                className="shrink-0 text-xs text-amo-muted hover:text-red-400"
                aria-label="Delete"
              >
                ×
              </button>
            </li>
          );
        })}
        {interactions.length === 0 && (
          <p className="text-sm text-amo-muted">No calls, emails, or meetings logged yet.</p>
        )}
      </ul>
    </div>
  );
}
