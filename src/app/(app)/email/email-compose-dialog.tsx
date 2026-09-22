"use client";

import { useEffect, useMemo, useState } from "react";
import RichTextarea from "@/components/rich-textarea";
import { sendEmailAction } from "@/actions/email-messages";
import type { EmailDetail } from "@/actions/email-messages";
import { buildQuotedReply } from "@/lib/mail/mime-build";

export type ComposeMode = "reply" | "replyAll" | "forward";

export interface EmailComposeTarget {
  message: EmailDetail;
  mode: ComposeMode;
}

export interface EmailComposeLabels {
  replyTitle: string;
  replyAllTitle: string;
  forwardTitle: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  send: string;
  sending: string;
  discard: string;
  sendFailed: string;
  recipientRequired: string;
  quotedHeader: string; // "{sender} wrote:" — {sender} filled in by this component
  sentToast: string;
}

function parseAddressField(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function subjectWithPrefix(subject: string, prefix: string): string {
  const stripped = subject.replace(/^\s*(re|fwd?|ré|tr)\s*:\s*/i, "");
  return `${prefix}: ${stripped}`;
}

// Reply/Reply All/Forward compose UI, opened from the Email Dialog's
// footer (or a row's quick actions) — shell copied from
// calendar-app/event-dialog.tsx for visual consistency with the rest of
// the app's edit-style dialogs.
export default function EmailComposeDialog({
  target,
  onClose,
  onSent,
  labels,
}: {
  target: EmailComposeTarget | null;
  onClose: () => void;
  onSent: () => void;
  labels: EmailComposeLabels;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    const { message, mode } = target;
    const selfAddress = message.replyIdentity.accountAddress.toLowerCase();

    let nextTo = "";
    let nextCc = "";
    if (mode === "reply") {
      nextTo = message.from.email;
    } else if (mode === "replyAll") {
      const rest = [message.from.email, ...message.to, ...message.cc].filter((a) => a.toLowerCase() !== selfAddress);
      const [first, ...others] = [...new Set(rest)];
      nextTo = first ?? "";
      nextCc = others.join(", ");
    }

    const sender = message.from.name ? `${message.from.name} <${message.from.email}>` : message.from.email;
    const { html: quoted } = buildQuotedReply(message, mode === "forward" ? "forward" : "reply", labels.quotedHeader.replace("{sender}", sender));

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTo(nextTo);
    setCc(nextCc);
    setSubject(subjectWithPrefix(message.subject, mode === "forward" ? "Fwd" : "Re"));
    setError(null);
    setHtml(`<p></p>${quoted}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    if (!target) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [target, onClose]);

  const title = useMemo(() => {
    if (!target) return "";
    return { reply: labels.replyTitle, replyAll: labels.replyAllTitle, forward: labels.forwardTitle }[target.mode];
  }, [target, labels]);

  if (!target) return null;

  async function handleSend() {
    if (!target) return;
    const toList = parseAddressField(to);
    if (toList.length === 0) {
      setError(labels.recipientRequired);
      return;
    }
    setSending(true);
    setError(null);
    const result = await sendEmailAction({
      inReplyToId: target.message.id,
      threadId: target.message.threadId,
      messageIdHeader: target.message.messageIdHeader,
      references: target.message.references,
      to: toList,
      cc: parseAddressField(cc),
      subject,
      html,
    });
    setSending(false);
    if ("error" in result) {
      setError(labels.sendFailed);
      return;
    }
    onSent();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-card-border px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-soft hover:bg-black/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
          <div className="flex items-center gap-2 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm">
            <span className="shrink-0 text-soft">{labels.from}:</span>
            <span className="min-w-0 flex-1 truncate text-ink">
              {target.message.replyIdentity.displayName
                ? `${target.message.replyIdentity.displayName} <${target.message.replyIdentity.accountAddress}>`
                : target.message.replyIdentity.accountAddress}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="w-10 shrink-0 text-sm text-soft">{labels.to}</label>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="w-10 shrink-0 text-sm text-soft">{labels.cc}</label>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="w-10 shrink-0 text-sm text-soft">{labels.subject}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink"
            />
          </div>

          <RichTextarea value={html} onChange={setHtml} className="min-h-[220px]" />

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-card-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5">
            {labels.discard}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={handleSend}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
          >
            {sending ? labels.sending : labels.send}
          </button>
        </div>
      </div>
    </div>
  );
}
