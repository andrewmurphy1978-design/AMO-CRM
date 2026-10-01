"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// "Export for AI" button: downloads Markdown files for an AI assistant (a .zip
// of everything, one combined .md, or any single file), or copies the combined
// text. Used on the Contact page (header) and the Project page (General Info
// card). The drop-down is portalled and fixed-positioned so a card's
// overflow-hidden can't clip it.
export default function AiExportMenu({
  base,
  files,
  lang,
  isAdmin,
}: {
  base: string; // e.g. /api/contacts/<id>/ai-export
  files: readonly { name: string; label: string }[];
  lang: "en" | "fr";
  isAdmin: boolean;
}) {
  const fr = lang === "fr";
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [apiKeys, setApiKeys] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const q = apiKeys ? "&apikeys=1" : "";

  function toggle() {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function copyAll() {
    const res = await fetch(`${base}?format=md&inline=1${q}`);
    await navigator.clipboard.writeText(await res.text());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const item = "block w-full px-3 py-2 text-left text-sm text-ink hover:bg-black/5";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="rounded-lg border border-white/40 px-3 py-1.5 text-sm font-medium text-amo-white hover:bg-white/10"
      >
        {fr ? "Exporter pour l'IA" : "Export for AI"} ▾
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-[70] max-h-[80vh] w-80 overflow-y-auto rounded-xl border border-card-border bg-card-bg py-1 text-left font-normal normal-case tracking-normal shadow-xl"
          >
            <a href={`${base}?format=zip${q}`} className={`${item} font-semibold`}>
              {fr ? "Tout télécharger (.zip)" : "Download all (.zip)"}
            </a>
            <a href={`${base}?format=md${q}`} className={item}>
              {fr ? "Un seul fichier (.md)" : "Single combined file (.md)"}
            </a>
            <button type="button" onClick={copyAll} className={item}>
              {copied ? (fr ? "Copié ✓" : "Copied ✓") : fr ? "Copier tout le texte" : "Copy all text"}
            </button>
            {isAdmin && (
              <label className="flex cursor-pointer items-start gap-2 border-t border-card-border px-3 py-2 text-xs text-ink">
                <input type="checkbox" checked={apiKeys} onChange={(e) => setApiKeys(e.target.checked)} className="mt-0.5" />
                <span>
                  <span className="font-semibold">{fr ? "Inclure les clés API partagées" : "Include shared API keys"}</span>
                  <span className="block text-soft">
                    {fr ? "Seulement celles marquées « Partager avec l'IA ». Utilisez des clés restreintes." : "Only keys marked “Share with AI”. Use restricted keys."}
                  </span>
                </span>
              </label>
            )}
            <div className="my-1 border-t border-card-border" />
            {files.map((f) => (
              <a key={f.name} href={`${base}?file=${f.name}${q}`} className={`${item} text-xs`}>
                {f.name} <span className="text-soft">— {f.label}</span>
              </a>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
