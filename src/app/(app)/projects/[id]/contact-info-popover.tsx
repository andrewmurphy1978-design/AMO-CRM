"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The header's contact-info button: toggles a drop-down holding the
// server-rendered Contact Info card (passed in as children). Portalled and
// fixed-positioned because the header title truncates (overflow hidden),
// which would clip an absolutely-positioned panel.
export default function ContactInfoPopover({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      const width = Math.min(760, window.innerWidth - 16);
      setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={toggle}
        className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/40 align-middle text-amo-white hover:bg-white/15"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 11v5" />
          <circle cx="12" cy="8" r="0.6" fill="currentColor" />
        </svg>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, left: pos.left, width: Math.min(760, window.innerWidth - 16) }}
            className="fixed z-50 max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
