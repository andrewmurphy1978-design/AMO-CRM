"use client";

import { useTransition } from "react";
import { deleteProject } from "@/actions/projects";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function DeleteProjectButton({ projectId, lang }: { projectId: string; lang: Lang }) {
  const [pending, startTransition] = useTransition();
  const t = getDict(lang);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(t.projectDetail.deleteConfirm)) return;
        startTransition(() => deleteProject(projectId));
      }}
      className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      {t.common.delete}
    </button>
  );
}
