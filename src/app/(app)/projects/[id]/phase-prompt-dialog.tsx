"use client";

import { useEffect, useState } from "react";
import { generatePhasePrompt } from "@/actions/phase-prompts";
import type { Lang } from "@/lib/i18n/dictionaries";

// Shows the AI prompt for a phase (built from the client, project, brand and tasks) with a Copy button.
export default function PhasePromptDialog({ projectId, phaseId, onClose, lang }: { projectId: string; phaseId: string; onClose: () => void; lang: Lang }) {
  const fr = lang === "fr";
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void generatePhasePrompt(projectId, phaseId)
      .then((res) => {
        if (!live) return;
        if (res.error) setError(res.error);
        else setText(res.prompt ?? "");
      })
      .catch(() => live && setError(fr ? "Impossible de générer le prompt." : "Couldn't generate the prompt."));
    return () => {
      live = false;
    };
  }, [projectId, phaseId, fr]);

  async function copy() {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(fr ? "Copie impossible — sélectionnez le texte et copiez-le." : "Couldn't copy — select the text and copy it.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 bg-emerald-700 px-4 py-3 text-white">
          <h3 className="font-display text-lg font-semibold">{fr ? "Prompt IA pour cette phase" : "AI prompt for this phase"}</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void copy()} disabled={text === null} className="rounded-md bg-white/25 px-3 py-1.5 text-sm font-semibold hover:bg-white/35 disabled:opacity-60">
              {copied ? (fr ? "Copié ✓" : "Copied ✓") : fr ? "Copier" : "Copy"}
            </button>
            <button type="button" onClick={onClose} className="rounded-md bg-white/15 px-2.5 py-1.5 text-sm hover:bg-white/25" aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {text === null && !error && <p className="text-sm text-soft">…</p>}
          {text !== null && (
            <>
              <p className="mb-2 text-xs text-soft">
                {fr ? "Collez ce texte dans l'IA de votre choix. Vous pouvez le modifier avant de le copier." : "Paste this into the AI of your choice. You can edit it before copying."}
              </p>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={22} className="w-full rounded-md border border-card-border bg-field-bg p-3 font-mono text-xs text-ink" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
