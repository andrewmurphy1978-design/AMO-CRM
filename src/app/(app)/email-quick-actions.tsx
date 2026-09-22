"use client";

export interface EmailQuickActionLabels {
  reply: string;
  replyAll: string;
  forward: string;
}

export type EmailQuickActionMode = "reply" | "replyAll" | "forward";

// Opens the Email Dialog's compose view directly in the right mode —
// `onAction` fetches the message's full detail and opens it (see
// email-screening-view.tsx's openComposeFor). `onOpen` (optional) still
// fires alongside, to mark the message read in the CRM the moment any of
// these is clicked, same as opening the message itself does.
export default function EmailQuickActions({
  labels,
  onAction,
  onOpen,
}: {
  labels: EmailQuickActionLabels;
  onAction: (mode: EmailQuickActionMode) => void;
  onOpen?: () => void;
}) {
  function handle(mode: EmailQuickActionMode) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpen?.();
      onAction(mode);
    };
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button type="button" title={labels.reply} onClick={handle("reply")} className="rounded p-1 text-soft hover:bg-black/10 hover:text-ink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
        </svg>
      </button>
      <button type="button" title={labels.replyAll} onClick={handle("replyAll")} className="rounded p-1 text-soft hover:bg-black/10 hover:text-ink">
        {/* Two overlapping back-arrows (distinct from the single Reply
            arrow above) — the standard "reply all" glyph. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15 7 10m0 0 5-5M7 10h9a6 6 0 0 1 6 6v1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 15 3 10m5-5-5 5" />
        </svg>
      </button>
      <button type="button" title={labels.forward} onClick={handle("forward")} className="rounded p-1 text-soft hover:bg-black/10 hover:text-ink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
        </svg>
      </button>
    </div>
  );
}
