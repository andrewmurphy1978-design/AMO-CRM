"use client";

export interface EmailQuickActionLabels {
  reply: string;
  replyAll: string;
  forward: string;
}

// Opens the message's own Gmail thread for each action — Gmail has no
// reliable public URL that jumps straight into its reply/forward compose
// box, so for now this is the quick version: one click into the thread,
// then Gmail's own Reply/Reply All/Forward buttons are right there. A true
// in-app compose (via Gmail's send API, with its own OAuth consent and a
// real To/Cc/Subject/Body dialog) is a separate, larger feature to build
// later. `onOpen` (optional) fires alongside the navigation — used to mark
// the message read in the CRM the moment any of these is clicked.
export default function EmailQuickActions({
  link,
  labels,
  onOpen,
}: {
  link: string;
  labels: EmailQuickActionLabels;
  onOpen?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        title={labels.reply}
        onClick={onOpen}
        className="rounded p-1 text-soft hover:bg-black/10 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
        </svg>
      </a>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        title={labels.replyAll}
        onClick={onOpen}
        className="rounded p-1 text-soft hover:bg-black/10 hover:text-ink"
      >
        {/* Two overlapping back-arrows (distinct from the single Reply
            arrow above) — the standard "reply all" glyph. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15 7 10m0 0 5-5M7 10h9a6 6 0 0 1 6 6v1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 15 3 10m5-5-5 5" />
        </svg>
      </a>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        title={labels.forward}
        onClick={onOpen}
        className="rounded p-1 text-soft hover:bg-black/10 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
        </svg>
      </a>
    </div>
  );
}
