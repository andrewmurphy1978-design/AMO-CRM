"use client";

import { useTransition } from "react";
import { deleteProject } from "@/actions/projects";

export default function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this project and all its tasks? This cannot be undone.")) return;
        startTransition(() => deleteProject(projectId));
      }}
      className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      Delete
    </button>
  );
}
