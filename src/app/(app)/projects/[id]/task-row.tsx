"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toggleTaskStatus, deleteTask } from "@/actions/tasks";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

// Priority: a small coloured circle before the task's name.
const PRIORITY_DOT: Record<string, string> = {
  LOW: "bg-slate-400",
  MEDIUM: "bg-amber-400",
  HIGH: "bg-orange-500",
  URGENT: "bg-red-600",
};

const ASSIGNED = "rgba(14, 165, 233, VAR)"; // sky: the task is mine
const SUPERVISED = "rgba(139, 92, 246, VAR)"; // violet: I supervise it
const tint = (c: string, a: number) => c.replace("VAR", String(a));

// Due date colour code: past = red, within 72 hours = yellow, otherwise green.
function dueClass(due: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due.getTime() < today.getTime()) return "bg-red-500/15 text-red-600";
  if (due.getTime() <= Date.now() + 72 * 3600 * 1000) return "bg-yellow-400/25 text-yellow-700";
  return "bg-emerald-500/15 text-emerald-700";
}

export default function TaskRow({
  task,
  projectId,
  lang,
  currentUserId,
  onEdit,
  onPrompt,
}: {
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    completedDate: string | null; // yyyy-mm-dd
    assignee: { name: string } | null;
    assigneeIds: string[];
    supervisorId: string | null;
  };
  projectId: string;
  lang: Lang;
  currentUserId?: string;
  // When given, clicking the title edits the task in a dialog instead of
  // navigating to its edit page.
  onEdit?: () => void;
  // The phase's first task: opens the AI prompt for the phase.
  onPrompt?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);
  const locale = lang === "fr" ? "fr-CA" : "en-CA";
  const done = task.status === "DONE";

  // Colour by my role: assigned to me, supervised by me, or both (a gradient of the two colours).
  const mine = Boolean(currentUserId && task.assigneeIds.includes(currentUserId));
  const supervise = Boolean(currentUserId && task.supervisorId === currentUserId);
  const stripe = mine && supervise ? `linear-gradient(180deg, ${tint(ASSIGNED, 1)}, ${tint(SUPERVISED, 1)})` : mine ? tint(ASSIGNED, 1) : supervise ? tint(SUPERVISED, 1) : "transparent";
  const background = mine && supervise ? `linear-gradient(90deg, ${tint(ASSIGNED, 0.14)}, ${tint(SUPERVISED, 0.14)})` : mine ? tint(ASSIGNED, 0.1) : supervise ? tint(SUPERVISED, 0.1) : undefined;
  const roleLabel = mine && supervise ? (lang === "fr" ? "Assignée à vous et supervisée par vous" : "Assigned to you and supervised by you") : mine ? (lang === "fr" ? "Assignée à vous" : "Assigned to you") : supervise ? (lang === "fr" ? "Supervisée par vous" : "Supervised by you") : undefined;

  const titleClass = `text-left text-sm font-medium hover:underline ${done ? "text-soft line-through" : "text-ink"}`;
  return (
    <li className="relative flex items-center gap-3 overflow-hidden rounded-md py-2 pl-4 pr-2" style={{ background }} title={roleLabel}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: stripe }} aria-hidden />
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        onChange={(e) => startTransition(() => toggleTaskStatus(task.id, projectId, e.target.checked))}
        className="h-4 w-4 shrink-0 rounded border-card-border"
      />
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority] ?? "bg-slate-400"}`} title={t.priorities[task.priority as keyof typeof t.priorities]} aria-label={t.priorities[task.priority as keyof typeof t.priorities]} />
      <div className="min-w-0 flex-1">
        {onEdit ? (
          <button type="button" onClick={onEdit} className={titleClass}>
            {task.title}
          </button>
        ) : (
          <Link href={`/projects/${projectId}/tasks/${task.id}/edit`} className={titleClass}>
            {task.title}
          </Link>
        )}
        {(onPrompt || task.assignee) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-soft">
            {onPrompt && (
              <button type="button" onClick={onPrompt} className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 hover:bg-emerald-100">
                🤖 {lang === "fr" ? "Prompt IA" : "AI prompt"}
              </button>
            )}
            {task.assignee && <span>{task.assignee.name}</span>}
          </div>
        )}
      </div>
      {done ? (
        task.completedDate && (
          <span className="shrink-0 text-xs text-soft" title={lang === "fr" ? "Date de fin" : "Completed"}>
            ✓ {new Date(`${task.completedDate}T00:00:00`).toLocaleDateString(locale, { dateStyle: "medium" })}
          </span>
        )
      ) : (
        task.dueDate && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${dueClass(new Date(task.dueDate))}`} title={t.projectDetail.due}>
            {new Date(task.dueDate).toLocaleDateString(locale, { dateStyle: "medium" })}
          </span>
        )
      )}
      <button
        type="button"
        disabled={pending}
        title={t.taskRow.delete}
        aria-label={t.taskRow.delete}
        onClick={() => {
          if (!confirm(t.taskRow.deleteConfirm)) return;
          startTransition(() => deleteTask(task.id, projectId));
        }}
        className="shrink-0 rounded p-1 text-soft hover:bg-red-500/10 hover:text-red-600 disabled:opacity-60"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10M9 9v4M11 9v4" />
        </svg>
      </button>
    </li>
  );
}
