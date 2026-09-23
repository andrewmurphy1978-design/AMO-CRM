"use client";

import { useEffect, useMemo, useState } from "react";
import { format, type Locale } from "date-fns";
import { formatClockTime } from "@/lib/calendar-time";
import RichTextarea from "@/components/rich-textarea";
import { sendEmailAction } from "@/actions/email-messages";
import type { EmailDetail } from "@/actions/email-messages";
import { sendDraftAction, discardDraftAction, createDraftAction, type DraftSource } from "@/actions/email-drafts";
import { resolveComposeSignatureAction, type ComposeSignatureMode } from "@/actions/email-signatures";
import { buildQuotedReply } from "@/lib/mail/mime-build";
import type { MailSource } from "@/lib/mail/identity";
import { NO_ADDRESS_COLOR, contrastTextColor } from "@/lib/email-address-match";
import { EmailLinkSummary, EmailLinkEditor, type EmailLinkConfig } from "./email-link-fields";

export type ComposeMode = "reply" | "replyAll" | "forward" | "draft" | "new";

export interface EmailComposeTarget {
  message: EmailDetail;
  mode: ComposeMode;
  // Both computed by the caller at click time — same reasoning as
  // EmailDialogTarget's own dotColor/linkConfig (see that file's comment).
  dotColor?: string | null;
  linkConfig?: EmailLinkConfig;
  // Set only for mode "draft" — which Drafts-folder row this came from, so
  // Send/Discard know where to remove it from afterward (see
  // sendDraftAction/discardDraftAction — a draft's own account is never in
  // question the way a reply's is, so these bypass sendEmailAction's
  // header-based identity guess entirely).
  draft?: { id: string; source: DraftSource };
}

export interface EmailComposeLabels {
  replyTitle: string;
  replyAllTitle: string;
  forwardTitle: string;
  draftTitle: string;
  newTitle: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  addBcc: string;
  subject: string;
  send: string;
  sending: string;
  cancel: string;
  discard: string;
  saveDraft: string;
  savingDraft: string;
  sendFailed: string;
  recipientRequired: string;
  quotedFrom: string;
  quotedTo: string;
  quotedDate: string;
  sentToast: string;
  discardedToast: string;
  draftSavedToast: string;
  attach: string;
  attachmentTooLarge: string; // "{name}" filled in by this component
  removeAttachment: string; // "{name}" filled in by this component
}

interface ComposeAttachment {
  filename: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
}

interface FromIdentity {
  source: MailSource;
  accountAddress: string;
}

// Comfortably under next.config.ts's 10mb Server Action body cap, leaving
// room for base64's ~33% overhead plus the rest of the request payload.
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // dataURL is "data:<mime>;base64,<data>" — only the part after the
      // comma is the actual base64 payload buildMimeMessage wants.
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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

function identityKey(id: FromIdentity): string {
  return `${id.source}:${id.accountAddress}`;
}

function parseIdentityKey(key: string): FromIdentity {
  const idx = key.indexOf(":");
  return { source: key.slice(0, idx) as MailSource, accountAddress: key.slice(idx + 1) };
}

// New/Reply/Reply All/Forward/Draft-review compose UI, opened from the
// Email Dialog's footer, a row's quick actions, the Drafts section, or the
// Email page's own "New email" button — shell copied from
// calendar-app/event-dialog.tsx for visual consistency with the rest of
// the app's edit-style dialogs.
export default function EmailComposeDialog({
  target,
  onClose,
  onSent,
  onDiscarded,
  onDraftSaved,
  dateLocale,
  intlLocale,
  hour12,
  defaultFontFamily,
  defaultFontSize,
  labels,
}: {
  target: EmailComposeTarget | null;
  onClose: () => void;
  onSent: () => void;
  onDiscarded?: () => void;
  onDraftSaved?: () => void;
  dateLocale: Locale | undefined;
  intlLocale: string;
  hour12: boolean;
  defaultFontFamily?: string | null;
  defaultFontSize?: string | null;
  labels: EmailComposeLabels;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [fromIdentity, setFromIdentity] = useState<FromIdentity | null>(null);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [linkExpanded, setLinkExpanded] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkExpanded(false);
    setShowBcc(false);
    setBcc("");
    setHtml("");
    setError(null);
    setAttachments([]);
    const { message, mode } = target;
    setFromIdentity({ source: message.replyIdentity.source, accountAddress: message.replyIdentity.accountAddress });

    if (mode === "draft") {
      setTo(message.to.join(", "));
      setCc(message.cc.join(", "));
      setSubject(message.subject);
      setHtml(message.html ?? (message.text ? `<pre style="white-space:pre-wrap">${message.text}</pre>` : ""));
      return;
    }

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

    setTo(nextTo);
    setCc(nextCc);
    setSubject(mode === "new" ? message.subject : subjectWithPrefix(message.subject, mode === "forward" ? "Fwd" : "Re"));

    // The signature lookup is async (a DB read) — everything above is set
    // synchronously so the dialog never flashes a stale body from whatever
    // was open before this, then the body itself fills in a moment later.
    const signatureMode: ComposeSignatureMode = mode === "new" ? "new" : mode === "forward" ? "forward" : "reply";
    let cancelled = false;
    resolveComposeSignatureAction(message.replyIdentity.accountAddress, signatureMode)
      .catch(() => null)
      .then((signatureHtml) => {
        if (cancelled) return;
        if (mode === "new") {
          setHtml(signatureHtml ? `<p><br></p><p><br></p>${signatureHtml}` : "");
          return;
        }
        const dateValue = message.date
          ? `${format(new Date(message.date), "EEEE, MMMM d, yyyy", { locale: dateLocale })} · ${formatClockTime(new Date(message.date), hour12, intlLocale)}`
          : "";
        const { html: quoted } = buildQuotedReply(message, { from: labels.quotedFrom, to: labels.quotedTo, date: labels.quotedDate, dateValue });
        setHtml(
          signatureHtml
            ? `<p><br></p>${signatureHtml}<p><br></p><p><br></p>${quoted}`
            : `<p><br></p><p><br></p>${quoted}`
        );
      });
    return () => {
      cancelled = true;
    };
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
    return { reply: labels.replyTitle, replyAll: labels.replyAllTitle, forward: labels.forwardTitle, draft: labels.draftTitle, new: labels.newTitle }[
      target.mode
    ];
  }, [target, labels]);

  if (!target) return null;

  async function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(labels.attachmentTooLarge.replace("{name}", file.name));
        continue;
      }
      const base64 = await fileToBase64(file);
      setAttachments((prev) => [...prev, { filename: file.name, mimeType: file.type || "application/octet-stream", base64, sizeBytes: file.size }]);
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    if (!target) return;
    const toList = parseAddressField(to);
    if (toList.length === 0) {
      setError(labels.recipientRequired);
      return;
    }
    setSending(true);
    setError(null);
    const attachmentInputs = attachments.map(({ filename, mimeType, base64 }) => ({ filename, mimeType, base64 }));
    const result = target.draft
      ? await sendDraftAction(target.draft.id, target.draft.source, {
          to: toList,
          cc: parseAddressField(cc),
          subject,
          html,
          attachments: attachmentInputs,
        })
      : await sendEmailAction({
          inReplyToId: target.mode === "new" ? null : target.message.id,
          threadId: target.mode === "new" ? null : target.message.threadId,
          messageIdHeader: target.mode === "new" ? null : target.message.messageIdHeader,
          references: target.mode === "new" ? [] : target.message.references,
          to: toList,
          cc: parseAddressField(cc),
          bcc: parseAddressField(bcc),
          subject,
          html,
          fromOverride: fromIdentity,
          attachments: attachmentInputs,
        });
    setSending(false);
    if ("error" in result) {
      // "not_connected"/"recipient_required" are internal codes with their
      // own translated labels; anything else is a raw SMTP/Gmail API
      // diagnostic (e.g. "SMTP AUTH PLAIN failed (535): ...") that's far
      // more useful shown as-is than hidden behind a generic message.
      if (result.error === "recipient_required") {
        setError(labels.recipientRequired);
      } else if (result.error === "not_connected") {
        setError(labels.sendFailed);
      } else {
        setError(`${labels.sendFailed} (${result.error})`);
      }
      return;
    }
    onSent();
  }

  async function handleSaveDraft() {
    if (!target || !fromIdentity) return;
    setSavingDraft(true);
    setError(null);
    const attachmentInputs = attachments.map(({ filename, mimeType, base64 }) => ({ filename, mimeType, base64 }));
    const result = await createDraftAction({
      to: parseAddressField(to),
      cc: parseAddressField(cc),
      bcc: parseAddressField(bcc),
      subject,
      html,
      attachments: attachmentInputs,
      from: fromIdentity,
      inReplyToId: target.mode === "new" ? null : target.message.id,
      threadId: target.mode === "new" ? null : target.message.threadId,
      messageIdHeader: target.mode === "new" ? null : target.message.messageIdHeader,
      references: target.mode === "new" ? [] : target.message.references,
    });
    setSavingDraft(false);
    if ("error" in result) {
      setError(result.error === "recipient_required" ? labels.recipientRequired : `${labels.sendFailed} (${result.error})`);
      return;
    }
    (onDraftSaved ?? onSent)();
  }

  async function handleDiscard() {
    if (!target?.draft) return;
    setDiscarding(true);
    await discardDraftAction(target.draft.id, target.draft.source);
    setDiscarding(false);
    (onDiscarded ?? onSent)();
  }

  const color = target.dotColor || NO_ADDRESS_COLOR;
  const fg = contrastTextColor(color);
  // fg is only ever black or white (contrastTextColor's whole job) — this
  // picks the border/hover treatment that stays visible against either,
  // same branch Calendar's own colored-header edit dialog uses.
  const headerBtnClass = fg === "#000000" ? "opacity-80 hover:opacity-100" : "opacity-90 hover:opacity-100";
  const identities = target.message.availableIdentities;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`flex h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl transition-[max-width] ${
          linkExpanded && target.linkConfig ? "max-w-[75rem]" : "max-w-4xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4" style={{ backgroundColor: color, color: fg }}>
          <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{title}</h3>
          <div className="flex shrink-0 items-center gap-3">
            {target.draft && (
              <button type="button" disabled={discarding} onClick={handleDiscard} className={`text-sm hover:underline disabled:opacity-60 ${headerBtnClass}`}>
                {labels.discard}
              </button>
            )}
            {!target.draft && (
              <button
                type="button"
                disabled={savingDraft}
                onClick={handleSaveDraft}
                className={`text-sm hover:underline disabled:opacity-60 ${headerBtnClass}`}
              >
                {savingDraft ? labels.savingDraft : labels.saveDraft}
              </button>
            )}
            <button type="button" onClick={onClose} className={`text-sm hover:underline ${headerBtnClass}`}>
              {labels.cancel}
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

        {/* Fixed, non-scrolling header row — From/To/Cc/Bcc/Subject on the
            left, the read-only link summary on the right, side by side so
            this row stays short and the body below gets the rest of the
            dialog's height (the same "one scrollbar, not two" fix applied
            to the Read Email dialog). */}
        <div className="flex shrink-0 gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <label className="w-10 shrink-0 text-sm text-soft">{labels.from}</label>
              {identities.length > 1 ? (
                <select
                  value={fromIdentity ? identityKey(fromIdentity) : ""}
                  onChange={(e) => setFromIdentity(parseIdentityKey(e.target.value))}
                  className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink"
                >
                  {identities.map((id) => (
                    <option key={identityKey(id)} value={identityKey(id)}>
                      {id.displayName ? `${id.displayName} <${id.accountAddress}>` : id.accountAddress}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="min-w-0 flex-1 truncate rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink">
                  {fromIdentity?.accountAddress ?? target.message.replyIdentity.accountAddress}
                </div>
              )}
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
              {!showBcc && (
                <button type="button" onClick={() => setShowBcc(true)} className="shrink-0 text-xs text-soft hover:underline">
                  {labels.addBcc}
                </button>
              )}
            </div>

            {showBcc && (
              <div className="flex items-center gap-2">
                <label className="w-10 shrink-0 text-sm text-soft">{labels.bcc}</label>
                <input
                  type="text"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="w-10 shrink-0 text-sm text-soft">{labels.subject}</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <label className="flex w-fit shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-card-border px-3 py-2 text-sm font-medium text-ink hover:bg-black/5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 shrink-0">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94a3 3 0 1 1 4.243 4.242L9.564 17.31a1.5 1.5 0 0 1-2.122-2.12l8.485-8.486"
                  />
                </svg>
                {labels.attach}
                <input type="file" multiple className="hidden" onChange={(e) => handleFilesSelected(e.target.files)} />
              </label>
              {attachments.map((a, i) => (
                <span key={i} className="flex items-center gap-1 rounded-full border border-card-border bg-field-bg px-2.5 py-1 text-xs text-ink">
                  <span className="max-w-[10rem] truncate">{a.filename}</span>
                  <span className="text-soft">({formatBytes(a.sizeBytes)})</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    title={labels.removeAttachment.replace("{name}", a.filename)}
                    className="ml-0.5 rounded-full p-0.5 text-soft hover:bg-black/10 hover:text-ink"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3 w-3">
                      <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>

          {target.linkConfig && (
            <div className="w-64 shrink-0 border-l border-card-border pl-4">
              <EmailLinkSummary
                current={target.linkConfig.current}
                linkLabel={target.linkConfig.labels.link}
                noneLabel={target.linkConfig.labels.none}
                editLabel={target.linkConfig.labels.edit}
                onEdit={() => setLinkExpanded((v) => !v)}
              />
            </div>
          )}
        </div>

        {/* The body fills the rest of the dialog's height and is the only
            scrollable region — the link editor, when open, sits beside it
            in the same right-hand column the summary above occupies. */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden px-5 pb-5">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
            <RichTextarea value={html} onChange={setHtml} className="min-h-[220px]" defaultFontFamily={defaultFontFamily} defaultFontSize={defaultFontSize} />

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>

          {linkExpanded && target.linkConfig && (
            <div className="w-64 shrink-0 overflow-y-auto border-l border-card-border pl-4">
              <EmailLinkEditor config={target.linkConfig} onDone={() => setLinkExpanded(false)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
