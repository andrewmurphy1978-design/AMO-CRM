"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTask } from "@/actions/tasks";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function DeleteTaskButton({
  taskId,
  projectId,
  lang,
}: {
  taskId: string;
  projectId: string;
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const t = getDict(lang);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(t.taskDetail.deleteConfirm)) return;
        startTransition(async () => {
          await deleteTask(taskId, projectId);
          router.push("/tasks");
        });
      }}
      className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      {t.taskDetail.delete}
    </button>
  );
}
