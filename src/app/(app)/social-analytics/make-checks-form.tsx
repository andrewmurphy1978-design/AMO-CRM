"use client";

import { useActionState } from "react";
import { saveSocialMakeChecksAction } from "@/actions/social-posts";

// Which Make scenario publishes each platform: a word from its name (e.g. "Facebook"), matched against its recent runs.
export default function MakeChecksForm({ keywords, fr }: { keywords: Record<string, string>; fr: boolean }) {
  const [state, action, pending] = useActionState(saveSocialMakeChecksAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 text-sm">
      {(["facebook", "linkedin", "x"] as const).map((p) => (
        <label key={p} className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? `Scénario Make — ${p}` : `Make scenario — ${p}`}</span>
          <input name={p} defaultValue={keywords[p] ?? ""} placeholder={fr ? "mot du nom" : "word in its name"} className="w-44 rounded-lg border border-card-border bg-white px-2 py-1.5" />
        </label>
      ))}
      <button disabled={pending} className="rounded-lg border border-card-border bg-card-bg px-3 py-1.5 font-medium text-ink hover:bg-black/5 disabled:opacity-60">{pending ? "…" : fr ? "Enregistrer" : "Save"}</button>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state?.success && <span className="text-xs text-emerald-700">{state.success}</span>}
    </form>
  );
}
