"use client";

import { useState } from "react";
import { deleteProject } from "@/actions/projects";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

// Delete with feedback: "Deleting…" while the project is being removed; the projects list then
// shows "Deleted".
export default function DeleteProjectButton({ projectId, lang }: { projectId: string; lang: Lang }) {
  const t = getDict(lang);
  const fr = lang === "fr";
  const [state, setState] = useState<"idle" | "deleting" | "error">("idle");

  async function remove() {
    if (!confirm(t.projectDetail.deleteConfirm)) return;
    setState("deleting");
    try {
      await deleteProject(projectId); // redirects to the projects list on success
    } catch (error) {
      // A redirect surfaces as a thrown NEXT_REDIRECT: let it through.
      if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
      setState("error");
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={state === "deleting"}
        onClick={remove}
        className="rounded-md border border-white/30 px-4 py-2 text-sm font-medium text-white hover:border-red-300 hover:bg-red-500/30 disabled:opacity-60"
      >
        {state === "deleting" ? (fr ? "Suppression…" : "Deleting…") : t.common.delete}
      </button>
      {state !== "idle" && (
        <div role="status" className={`fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-lg ${state === "error" ? "bg-red-600" : "bg-slate-700"}`}>
          {state === "deleting" ? (fr ? "Suppression en cours…" : "Deleting…") : fr ? "La suppression a échoué — réessayez." : "Deleting failed — try again."}
        </div>
      )}
    </>
  );
}
