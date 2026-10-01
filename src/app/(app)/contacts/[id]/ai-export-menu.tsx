"use client";

import { useEffect, useRef, useState } from "react";
import { CONTACT_AI_FILES } from "@/lib/contact-ai-files";

// Header button on the Contact page: downloads the contact's info as Markdown
// files for an AI assistant (a .zip of all files, one combined .md, or any
// single file), or copies the combined text to the clipboard.
export default function AiExportMenu({ contactId, lang }: { contactId: string; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const base = `/api/contacts/${contactId}/ai-export`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function copyAll() {
    const res = await fetch(`${base}?format=md&inline=1`);
    await navigator.clipboard.writeText(await res.text());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const item = "block w-full px-3 py-2 text-left text-sm text-ink hover:bg-black/5";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-white/40 px-3 py-2 text-sm font-medium text-amo-white hover:bg-white/10"
      >
        {fr ? "Exporter pour l'IA" : "Export for AI"} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-card-border bg-card-bg py-1 shadow-xl">
          <a href={`${base}?format=zip`} className={`${item} font-semibold`}>
            {fr ? "Tout télécharger (.zip)" : "Download all (.zip)"}
          </a>
          <a href={`${base}?format=md`} className={item}>
            {fr ? "Un seul fichier (.md)" : "Single combined file (.md)"}
          </a>
          <button type="button" onClick={copyAll} className={item}>
            {copied ? (fr ? "Copié ✓" : "Copied ✓") : fr ? "Copier tout le texte" : "Copy all text"}
          </button>
          <div className="my-1 border-t border-card-border" />
          {CONTACT_AI_FILES.map((f) => (
            <a key={f.name} href={`${base}?file=${f.name}`} className={`${item} text-xs`}>
              {f.name} <span className="text-soft">— {f.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
