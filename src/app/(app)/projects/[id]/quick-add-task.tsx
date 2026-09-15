"use client";

import { useActionState, useRef, useEffect } from "react";
import { createTask } from "@/actions/tasks";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function QuickAddTask({ projectId, lang }: { projectId: string; lang: Lang }) {
  const [state, formAction, pending] = useActionState(createTask, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const t = getDict(lang);

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
        placeholder={t.quickAddTask.placeholder}
        className="flex-1 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      />
      <button
        type="submit"
        disabled={pending}
        className="btn-primary rounded-lg px-3 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {t.quickAddTask.addTask}
      </button>
    </form>
  );
}
