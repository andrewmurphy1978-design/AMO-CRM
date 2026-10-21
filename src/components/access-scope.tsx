"use client";

import { useEffect, useRef } from "react";
import type { Level } from "@/lib/permissions-shared";

// Hides the buttons that change data when the person only has read access (and the ones that delete when they cannot
// delete). The server refuses those actions regardless; this just keeps the screen from offering them.
const WRITE_LABEL = /^\s*(\+|add\b|new\b|create\b|save\b|edit\b|update\b|import\b|send\b|confirm\b|upload\b|reply\b|forward\b|compose\b|reconcile\b|move\b|merge\b|rename\b|apply\b|categori[sz]e\b|recategori[sz]e\b|suggest\b|archive\b|mark\b|ajouter\b|nouveau\b|nouvelle\b|créer\b|creer\b|enregistrer\b|modifier\b|mettre à jour\b|importer\b|envoyer\b|confirmer\b|téléverser\b|répondre\b|transférer\b|rédiger\b|réconcilier\b|déplacer\b|renommer\b|appliquer\b|catégoriser\b|archiver\b|marquer\b)/i;
const DELETE_LABEL = /(delete|remove|trash|discard|purge|supprimer|retirer|effacer|corbeille|🗑)/i;

export default function AccessScope({ level, children }: { level: Level; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || level === "DELETE") return;
    const sweep = () => {
      root.querySelectorAll<HTMLElement>("button, input[type=submit], [role=button]").forEach((el) => {
        const text = (el.textContent || (el as HTMLInputElement).value || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
        if (el.hasAttribute("data-readonly-ok")) return;
        const isDelete = DELETE_LABEL.test(text);
        const isWrite = (el as HTMLButtonElement).type === "submit" || WRITE_LABEL.test(text);
        if (isDelete || (level === "READ" && isWrite)) el.style.display = "none";
      });
    };
    sweep();
    const obs = new MutationObserver(sweep);
    obs.observe(root, { childList: true, subtree: true });
    // Dialogs render in a portal outside this wrapper, so watch the document body for them too.
    const dialogObs = new MutationObserver(() => {
      document.querySelectorAll<HTMLElement>("[role=dialog]").forEach((d) => {
        d.querySelectorAll<HTMLElement>("button, input[type=submit]").forEach((el) => {
          const text = (el.textContent || "").trim();
          if (DELETE_LABEL.test(text) || (level === "READ" && ((el as HTMLButtonElement).type === "submit" || WRITE_LABEL.test(text)))) el.style.display = "none";
        });
      });
    });
    dialogObs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); dialogObs.disconnect(); };
  }, [level]);
  return (
    <div ref={ref} className="contents" data-access={level.toLowerCase()}>
      {level === "READ" && (
        <p className="mb-3 rounded-md border border-card-border bg-field-bg/60 px-3 py-2 text-xs text-soft">Read-only access · Accès en lecture seule</p>
      )}
      {children}
    </div>
  );
}
