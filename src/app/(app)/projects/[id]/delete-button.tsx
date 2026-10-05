"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteProject } from "@/actions/projects";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

// Delete with feedback: "Deleting…" while the project is being removed, "Deleted" once it is,
// then back to the projects list.
export default function DeleteProjectButton({ projectId, lang }: { projectId: string; lang: Lang }) {
  const t = getDict(lang);
  const router = useRouter();
  const fr = lang === "fr";
  const [state, setState] = useState<"idle" | "deleting" | "deleted" | "error">("idle");

  async function remove() {
    if (!confirm(t.projectDetail.deleteConfirm)) return;
    setState("deleting");
    try {
      await deleteProject(projectId);
      setState("deleted");
      setTimeout(() => router.push("/projects"), 1200);
    } catch {
      setState("error");
    }
  }

  const message =
    state === "deleting" ? (fr ? "Suppression en cours…" : "Deleting…") : state === "deleted" ? (fr ? "Projet supprimé" : "Deleted") : state === "error" ? (fr ? "La suppression a échoué — réessayez." : "Deleting failed — try again.") : null;

  return (
    <>
      <button
        type="button"
        disabled={state === "deleting" || state === "deleted"}
        onClick={remove}
        className="rounded-md border border-white/30 px-4 py-2 text-sm font-medium text-white hover:border-red-300 hover:bg-red-500/30 disabled:opacity-60"
      >
        {state === "deleting" ? (fr ? "Suppression…" : "Deleting…") : state === "deleted" ? (fr ? "Supprimé" : "Deleted") : t.common.delete}
      </button>
      {message && (
        <div
          role="status"
          className={`fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-lg ${state === "deleted" ? "bg-emerald-600" : state === "error" ? "bg-red-600" : "bg-slate-700"}`}
        >
          {message}
        </div>
      )}
    </>
  );
}
