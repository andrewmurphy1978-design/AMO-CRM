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
      className="rounded-md border border-white/30 px-4 py-2 text-sm font-medium text-white hover:border-red-300 hover:bg-red-500/30 disabled:opacity-60"
    >
      {t.common.delete}
    </button>
  );
}
