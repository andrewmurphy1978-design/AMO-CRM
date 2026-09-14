"use client";

import { useActionState, useRef, useEffect } from "react";
import { createTask } from "@/actions/tasks";

export default function QuickAddTask({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createTask, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state?.error) {
      formRef.current?.reset();
    }
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="flex gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="status" value="TODO" />
      <input type="hidden" name="priority" value="MEDIUM" />
      <input
        name="title"
        required
        placeholder="Add a task..."
        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
      >
        Add task
      </button>
    </form>
  );
}
