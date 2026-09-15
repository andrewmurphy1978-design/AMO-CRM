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
        className="flex-1 rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-gradient-to-r from-amo-lime to-amo-teal px-3 py-2 text-sm font-semibold text-amo-green shadow-[0_4px_14px_rgba(46,204,113,0.25)] transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        Add task
      </button>
    </form>
  );
}
