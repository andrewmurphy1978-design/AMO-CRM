"use client";

import { POSTS_BUCKET_COLORS, POSTS_CARD_ACCENT_BAR, POSTS_CARD_ACCENT_DOT, POSTS_CARD_BG } from "./posts-summary-colors";
import PostsIcon from "./posts-icon";
import SubCard from "./summary-sub-card";

export interface PostsSummaryLabels {
  title: string;
  totalLabel: string;
  makeLabel: string;
  bufferLabel: string;
  sentLabel: string;
  failedLabel: string;
}

export interface PostsSummaryCounts {
  queued: number;
  make: number;
  buffer: number;
  sent: number;
  failed: number | null; // null = Make could not be read
}

export default function PostsSummaryCard({ counts, labels }: { counts: PostsSummaryCounts; labels: PostsSummaryLabels }) {
  const failedColor = counts.failed ? POSTS_BUCKET_COLORS.FAILED : POSTS_BUCKET_COLORS.FAILED_NONE;
  return (
    <button
      type="button"
      onClick={() => {
        // Desktop and mobile each render their own instance of the Post Details card (see page.tsx), so this picks
        // whichever one is on screen, matching the lg (1024px) breakpoint that switches between the two.
        const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
        document.getElementById(isDesktop ? "dashboard-posts-card-desktop" : "dashboard-posts-card-mobile")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className={`group relative w-full overflow-hidden rounded-2xl border border-card-border p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(13,148,136,0.15)] sm:p-5 ${POSTS_CARD_BG}`}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${POSTS_CARD_ACCENT_BAR}`} />
      {/* Same layout as the other Summary cards: title and the headline total share row 1, then four cells. */}
      <div className="grid grid-cols-4 items-center gap-1.5">
        <div className="col-span-2 flex items-center gap-2">
          <PostsIcon />
          <h3 className="font-display text-lg font-semibold text-ink">{labels.title}</h3>
        </div>
        <SubCard bg={POSTS_CARD_ACCENT_DOT} text="text-white" value={counts.queued} label={labels.totalLabel} layout="row" className="col-span-2" />
        <SubCard bg={POSTS_BUCKET_COLORS.MAKE.bg} text={POSTS_BUCKET_COLORS.MAKE.text} value={counts.make} label={labels.makeLabel} />
        <SubCard bg={POSTS_BUCKET_COLORS.BUFFER.bg} text={POSTS_BUCKET_COLORS.BUFFER.text} value={counts.buffer} label={labels.bufferLabel} />
        <SubCard bg={POSTS_BUCKET_COLORS.SENT.bg} text={POSTS_BUCKET_COLORS.SENT.text} value={counts.sent} label={labels.sentLabel} />
        <SubCard bg={failedColor.bg} text={failedColor.text} value={counts.failed ?? "—"} label={labels.failedLabel} />
      </div>
    </button>
  );
}
