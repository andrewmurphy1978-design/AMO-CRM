"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFolderPath } from "@/actions/local-folders";

const LABEL = "text-xs font-semibold uppercase tracking-wide text-soft";

// The Folder field of a Contact or Project: the local folder where its files are kept (its path is
// made from Settings > Local files). Click the path to copy it, or edit it by hand.
export default function FolderField({ kind, id, path, created, lang }: { kind: "contact" | "project"; id: string; path: string | null; created: boolean; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path ?? "");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <p className={LABEL}>{fr ? "Dossier" : "Folder"}</p>
      {editing ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-2 py-1 text-sm text-ink" />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setFolderPath(kind, id, draft);
                setEditing(false);
                router.refresh();
              })
            }
            className="text-xs font-semibold text-emerald-700 hover:underline"
          >
            {fr ? "Enregistrer" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-soft hover:underline">
            {fr ? "Annuler" : "Cancel"}
          </button>
        </div>
      ) : (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink">
          {path ? (
            <>
              <span>📁</span>
              <button
                type="button"
                title={fr ? "Cliquer pour copier le chemin" : "Click to copy the path"}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(path);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
                className="min-w-0 break-all text-left font-mono text-xs hover:underline"
              >
                {path}
              </button>
              {copied && <span className="text-xs text-emerald-700">{fr ? "Copié" : "Copied"}</span>}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${created ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {created ? (fr ? "créé sur l'ordinateur" : "created on the computer") : fr ? "pas encore créé" : "not created yet"}
              </span>
            </>
          ) : (
            <span className="text-soft">{fr ? "— (réglez le dossier des fichiers locaux dans Paramètres)" : "— (set the local files folder in Settings)"}</span>
          )}
          <button type="button" onClick={() => { setDraft(path ?? ""); setEditing(true); }} className="text-xs text-soft hover:underline">
            {fr ? "Modifier" : "Edit"}
          </button>
        </p>
      )}
    </div>
  );
}
