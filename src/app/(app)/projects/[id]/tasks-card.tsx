"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { createTaskViaDialog, updateTaskViaDialog, type TaskDialogValues } from "@/actions/tasks";
import Card from "@/components/section-card";
import TaskRow from "./task-row";
import TaskDialog from "./task-dialog";

export interface TaskCardItem {
  id: string;
  title: string;
  status: TaskDialogValues["status"];
  priority: TaskDialogValues["priority"];
  dueDate: string | null; // ISO
  assignee: { name: string } | null;
  // Everything the edit dialog needs, as plain form values.
  values: TaskDialogValues;
}

const BLANK: TaskDialogValues = {
  title: "",
  phaseId: "",
  status: "TODO",
  priority: "MEDIUM",
  assigneeId: "",
  supervisorId: "",
  startDate: "",
  dueDate: "",
  description: "",
};

// The project page's Tasks card: a + in the header adds a task, clicking a
// task's title edits it — both in the same dialog.
export default function TasksCard({
  projectId,
  tasks,
  users,
  phases,
  lang,
}: {
  projectId: string;
  tasks: TaskCardItem[];
  users: { id: string; name: string }[];
  phases: { id: string; name: string }[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const router = useRouter();
  const [dialog, setDialog] = useState<{ task: TaskCardItem | null; key: number } | null>(null);
  const [count, setCount] = useState(0);
  const open = tasks.filter((tk) => tk.status !== "DONE");
  const done = tasks.filter((tk) => tk.status === "DONE");

  function show(task: TaskCardItem | null) {
    setCount((c) => c + 1);
    setDialog({ task, key: count + 1 });
  }

  const row = (task: TaskCardItem) => (
    <TaskRow
      key={task.id}
      task={{ id: task.id, title: task.title, status: task.status, priority: task.priority, dueDate: task.dueDate ? new Date(task.dueDate) : null, assignee: task.assignee }}
      projectId={projectId}
      lang={lang}
      onEdit={() => show(task)}
    />
  );

  return (
    <Card
      color="tasks"
      title={
        <>
          {t.projectDetail.tasksTitle}
          {open.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{open.length}</span>
          )}
        </>
      }
      compact
      actions={
        <button
          type="button"
          title={t.quickAddTask.addTask}
          aria-label={t.quickAddTask.addTask}
          onClick={() => show(null)}
          className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20"
        >
          +
        </button>
      }
    >
      {tasks.length === 0 ? (
        <p className="text-sm text-soft">{t.projectDetail.noTasksYet}</p>
      ) : (
        <>
          <ul className="divide-y divide-card-border">{open.map(row)}</ul>
          {done.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs font-medium text-soft">{t.projectDetail.completed(done.length)}</summary>
              <ul className="mt-2 divide-y divide-card-border">{done.map(row)}</ul>
            </details>
          )}
        </>
      )}

      {dialog && (
        <TaskDialog
          key={dialog.key}
          open
          onClose={() => setDialog(null)}
          lang={lang}
          users={users}
          phases={phases}
          initial={dialog.task ? dialog.task.values : BLANK}
          onSave={async (values) => {
            const result = dialog.task ? await updateTaskViaDialog(dialog.task.id, projectId, values) : await createTaskViaDialog(projectId, values);
            if (result.error) return result;
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}
