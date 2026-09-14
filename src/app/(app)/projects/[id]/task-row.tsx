"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toggleTaskStatus, deleteTask } from "@/actions/tasks";

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-amber-100 text-amber-700",
  URGENT: "bg-red-100 text-red-700",
};

export default function TaskRow({
  task,
  projectId,
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
}) {
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex items-center gap-3 py-3">
      <input
        type="checkbox"
        checked={task.status === "DONE"}
        disabled={pending}
        onChange={(e) => startTransition(() => toggleTaskStatus(task.id, projectId, e.target.checked))}
        className="h-4 w-4 rounded border-slate-300"
      />
      <div className="flex-1">
        <Link
          href={`/projects/${projectId}/tasks/${task.id}/edit`}
          className={`text-sm font-medium hover:underline ${
            task.status === "DONE" ? "text-slate-400 line-through" : "text-slate-900"
          }`}
        >
          {task.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className={`rounded-full px-2 py-0.5 font-medium ${PRIORITY_COLORS[task.priority]}`}>
            {task.priority}
          </span>
          {task.assignee && <span>{task.assignee.name}</span>}
          {task.dueDate && <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>}
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this task?")) return;
          startTransition(() => deleteTask(task.id, projectId));
        }}
        className="text-xs text-slate-400 hover:text-red-600"
      >
        Delete
      </button>
    </li>
  );
}
