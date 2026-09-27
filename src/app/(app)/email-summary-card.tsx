"use client";

import { useEffect, useState } from "react";
import {
  EMAIL_SECTION_COLORS,
  EMAIL_CARD_ACCENT_BAR,
  EMAIL_CARD_ACCENT_DOT,
} from "./email-section-colors";
import { fetchDraftsAction } from "@/actions/email-drafts";
import { getDict } from "@/lib/i18n/dictionaries";

export interface EmailSummaryLabels {
  title: string;
  today: string;
  awaitingReply: string;
  needsAttention: string;
  canWait: string;
}

function Dot({ className }: { className: string }) {
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

export default function EmailSummaryCard({
  connected,
  lang,
  labels,
}: {
  connected: boolean;
  lang: "en" | "fr";
  labels: EmailSummaryLabels;
}) {
  const [draftsCount, setDraftsCount] = useState(0);
  const draftsLabel = getDict(lang).dashboard.emailSummaryDrafts(draftsCount);

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
      className="group relative w-full overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(99,102,241,0.15)] sm:p-5"
    >
      <div
        className={`absolute inset-x-0 top-0 h-[3px] ${EMAIL_CARD_ACCENT_BAR}`}
      />
      <h3 className="font-display text-lg font-semibold text-ink">
        {labels.title}
      </h3>
      <ul className="mt-1.5 space-y-1.5 text-sm sm:mt-3">
        <li className="flex items-start gap-2">
          <Dot className={EMAIL_CARD_ACCENT_DOT} />
          <span className="text-ink">{labels.today}</span>
        </li>
        <li className="flex items-start gap-2">
          <Dot className={EMAIL_SECTION_COLORS.DRAFTS.headerBg} />
          <span className="text-ink">{draftsLabel}</span>
        </li>
        <li className="flex items-start gap-2">
          <Dot className={EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.headerBg} />
          <span className="text-ink">{labels.awaitingReply}</span>
        </li>
        <li className="flex items-start gap-2">
          <Dot className={EMAIL_SECTION_COLORS.NEEDS_ATTENTION.headerBg} />
          <span className="text-ink">{labels.needsAttention}</span>
        </li>
        <li className="flex items-start gap-2">
          <Dot className={EMAIL_SECTION_COLORS.CAN_WAIT.headerBg} />
          <span className="text-ink">{labels.canWait}</span>
        </li>
      </ul>
    </button>
  );
}
