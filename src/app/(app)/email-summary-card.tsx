"use client";

import { useEffect, useState } from "react";
import {
  EMAIL_SECTION_COLORS,
  EMAIL_CARD_ACCENT_BAR,
  EMAIL_CARD_ACCENT_DOT,
  EMAIL_CARD_BG,
} from "./email-section-colors";
import { fetchDraftsAction } from "@/actions/email-drafts";
import EmailIcon from "./email-icon";
import SubCard from "./summary-sub-card";

export interface EmailSummaryLabels {
  title: string;
  todayLabel: string;
  draftsLabel: string;
  awaitingReplyLabel: string;
  needsAttentionLabel: string;
  canWaitLabel: string;
}

export interface EmailSummaryCounts {
  today: number;
  awaitingReply: number;
  needsAttention: number;
  canWait: number;
}

export default function EmailSummaryCard({
  connected,
  counts,
  labels,
}: {
  connected: boolean;
  counts: EmailSummaryCounts;
  labels: EmailSummaryLabels;
}) {
  const [draftsCount, setDraftsCount] = useState(0);

  useEffect(() => {
    if (!connected) return;
    fetchDraftsAction()
      .then((drafts) => setDraftsCount(drafts.length))
      .catch(() => {});
  }, [connected]);

  function scrollToEmailCard() {
    document
      .getElementById("dashboard-email-card")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button
      type="button"
      onClick={scrollToEmailCard}
      className={`group relative w-full overflow-hidden rounded-2xl border border-card-border p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(99,102,241,0.15)] sm:p-5 ${EMAIL_CARD_BG}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-[3px] ${EMAIL_CARD_ACCENT_BAR}`}
      />
      {/* One 4-column grid for both rows: the title and the "today" card
          share row 1 (2 columns each — "today" is the only sub-card that's
          2 columns wide, on the same line as the Email title), then the
          other 4 metrics go back to a single 1-column-each row, exactly
          like before. */}
      <div className="grid grid-cols-4 items-center gap-1.5">
        <div className="col-span-2 flex items-center gap-2">
          <EmailIcon />
          <h3 className="font-display text-lg font-semibold text-ink">
            {labels.title}
          </h3>
        </div>
        <SubCard
          bg={EMAIL_CARD_ACCENT_DOT}
          text="text-white"
          value={counts.today}
          label={labels.todayLabel}
          layout="row"
          className="col-span-2"
        />
        <SubCard
          bg={EMAIL_SECTION_COLORS.DRAFTS.headerBg}
          text={EMAIL_SECTION_COLORS.DRAFTS.headerText}
          value={draftsCount}
          label={labels.draftsLabel}
        />
        <SubCard
          bg={EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.headerBg}
          text={EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.headerText}
          value={counts.awaitingReply}
          label={labels.awaitingReplyLabel}
        />
        <SubCard
          bg={EMAIL_SECTION_COLORS.NEEDS_ATTENTION.headerBg}
          text={EMAIL_SECTION_COLORS.NEEDS_ATTENTION.headerText}
          value={counts.needsAttention}
          label={labels.needsAttentionLabel}
        />
        <SubCard
          bg={EMAIL_SECTION_COLORS.CAN_WAIT.headerBg}
          text={EMAIL_SECTION_COLORS.CAN_WAIT.headerText}
          value={counts.canWait}
          label={labels.canWaitLabel}
        />
      </div>
    </button>
  );
}
