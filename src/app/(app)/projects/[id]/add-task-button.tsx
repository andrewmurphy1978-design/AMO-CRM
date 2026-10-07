"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { createTaskViaDialog, type TaskDialogValues } from "@/actions/tasks";
import TaskDialog from "./task-dialog";

const BLANK: TaskDialogValues = {
  title: "",
  phaseId: "",
  status: "TODO",
  priority: "MEDIUM",
  assigneeId: "",
  assigneeIds: [],
  supervisorId: "",
  startDate: "",
  dueDate: "",
  description: "",
  aiPrompt: "",
};

// Replaces the old always-visible QuickAddTask inline form — same
// add-button-opens-a-dialog pattern PhaseList already uses for phases, so
// adding a task no longer takes up permanent space in the Tasks card.
export default function AddTaskButton({
  projectId,
  users,
  phases,
  lang,
}: {
  projectId: string;
  users: { id: string; name: string }[];
  phases: { id: string; name: string }[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t.quickAddTask.addTask}
        aria-label={t.quickAddTask.addTask}
        className="btn-primary flex items-center justify-center rounded-lg p-1.5 shadow-sm sm:justify-start sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm sm:font-semibold"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
        <span className="hidden sm:inline">{t.quickAddTask.addTask}</span>
      </button>

      {open && (
        <TaskDialog
          open
          onClose={() => setOpen(false)}
          lang={lang}
          users={users}
          phases={phases}
          projectId={projectId}
          initial={BLANK}
          onSave={async (values) => {
            const result = await createTaskViaDialog(projectId, values);
            if (result.error) return result;
            router.refresh();
          }}
        />
      )}
    </>
  );
}
