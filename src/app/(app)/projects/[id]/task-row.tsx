"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toggleTaskStatus, deleteTask } from "@/actions/tasks";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-black/5 text-soft",
  MEDIUM: "bg-sky-50 text-sky-700",
  HIGH: "bg-amber-50 text-amber-700",
  URGENT: "bg-red-50 text-red-600",
};

export default function TaskRow({
  task,
  projectId,
  lang,
}: {
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    assignee: { name: string } | null;
  };
  projectId: string;
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);

  return (
    <li className="flex items-center gap-3 py-3">
      <input
        type="checkbox"
        checked={task.status === "DONE"}
        disabled={pending}
        onChange={(e) => startTransition(() => toggleTaskStatus(task.id, projectId, e.target.checked))}
        className="h-4 w-4 rounded border-card-border"
      />
      <div className="flex-1">
        <Link
          href={`/projects/${projectId}/tasks/${task.id}/edit`}
          className={`text-sm font-medium hover:underline ${
            task.status === "DONE" ? "text-soft line-through" : "text-ink"
          }`}
        >
          {task.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-soft">
          <span className={`rounded-full px-2 py-0.5 font-medium ${PRIORITY_COLORS[task.priority]}`}>
            {t.priorities[task.priority as keyof typeof t.priorities]}
          </span>
          {task.assignee && <span>{task.assignee.name}</span>}
          {task.dueDate && <span>{t.projectDetail.due} {new Date(task.dueDate).toLocaleDateString()}</span>}
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(t.taskRow.deleteConfirm)) return;
          startTransition(() => deleteTask(task.id, projectId));
        }}
        className="text-xs text-soft hover:text-red-600"
      >
        {t.taskRow.delete}
      </button>
    </li>
  );
}
