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
// later. Plain <a> tags rather than a client component since both the
// Dashboard's card (client) and the Email page (server) use this the same
// way — no interactivity needed beyond opening a link.
export default function EmailQuickActions({ link, labels }: { link: string; labels: EmailQuickActionLabels }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        title={labels.reply}
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
        className="relative rounded p-1 text-soft hover:bg-black/10 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
        </svg>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-current text-[6px] font-bold leading-none text-card-bg">
          2
        </span>
      </a>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        title={labels.forward}
        className="rounded p-1 text-soft hover:bg-black/10 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
        </svg>
      </a>
    </div>
  );
}
