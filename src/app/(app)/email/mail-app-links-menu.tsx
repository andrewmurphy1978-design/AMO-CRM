"use client";

import { useEffect, useRef, useState } from "react";
import { GmailIcon, IonosIcon } from "./mail-brand-icons";

// Mobile only: the header has no room for two full "Open Gmail" / "Open
// IONOS webmail" buttons alongside New email and Refresh (that's exactly
// what was squeezing the page title down to a sliver) — so below `sm`
// both collapse into one icon trigger that opens a small menu offering
// both. Desktop/tablet keeps the two separate buttons (rendered by the
// caller, hidden below `sm`) unchanged.
export default function MailAppLinksMenu({
  triggerLabel,
  gmailLabel,
  ionosLabel,
}: {
  triggerLabel: string;
  gmailLabel: string;
  ionosLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={triggerLabel}
        aria-label={triggerLabel}
        aria-haspopup="true"
        aria-expanded={open}
        className="btn-primary flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold shadow-sm"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 6.75c0-.621.504-1.125 1.125-1.125h17.25c.621 0 1.125.504 1.125 1.125v10.5c0 .621-.504 1.125-1.125 1.125H3.375A1.125 1.125 0 0 1 2.25 17.25V6.75Zm0 0 9.75 6.75 9.75-6.75"
          />
        </svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3 w-3 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-card-border bg-card-bg py-1 shadow-lg">
          <a
            href="https://mail.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-black/5"
          >
            <GmailIcon className="h-4 w-4 shrink-0" />
            {gmailLabel}
          </a>
          <a
            href="https://mail.ionos.com/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-black/5"
          >
            <IonosIcon className="h-4 w-4 shrink-0" />
            {ionosLabel}
          </a>
        </div>
      )}
    </div>
  );
}
