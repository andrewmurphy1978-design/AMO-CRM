"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "@/lib/clsx";
import { format, type Locale } from "date-fns";
import { formatClockTime } from "@/lib/calendar-time";
import RichTextarea from "@/components/rich-textarea";
import { saveEmailLink } from "@/actions/links";
import { sendEmailAction } from "@/actions/email-messages";
import type { EmailDetail } from "@/actions/email-messages";
import { sendDraftAction, discardDraftAction, createDraftAction, type DraftSource } from "@/actions/email-drafts";
import { resolveComposeSignatureAction, type ComposeSignatureMode } from "@/actions/email-signatures";
import { buildQuotedReply } from "@/lib/mail/mime-build";
import type { MailIdentity, MailSource } from "@/lib/mail/identity";
import { NO_ADDRESS_COLOR, contrastTextColor } from "@/lib/email-address-match";
import { EmailLinkSummary, EmailLinkEditor, linkTargetFor, type EmailLinkConfig } from "./email-link-fields";
import { buildAddressBook, type AddressBookEntry, type LinkOption, type LinkValues } from "../link-dialog";

export type ComposeMode = "reply" | "replyAll" | "forward" | "draft" | "new";

export interface EmailComposeTarget {
  message: EmailDetail;
  mode: ComposeMode;
  // Both computed by the caller at click time — same reasoning as
  // EmailDialogTarget's own dotColor/linkConfig (see that file's comment).
  dotColor?: string | null;
  linkConfig?: EmailLinkConfig;
  // For mode "new": body placed above the signature (e.g. a prepared message).
  initialHtml?: string;
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
  addCc: string;
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

// Attached beneath the To/Cc/Bcc inputs — as the user types, whatever's
// after the last comma/semicolon is matched against the address book by
// name or address; picking a match appends "Name <email>" (or just the
// email, name-less) and a trailing ", " so the next address can be typed
// right away. Closing on blur (rather than a click-outside listener) needs
// each suggestion's onMouseDown to preventDefault, since a plain click
// would otherwise blur the input — and dismiss the list — before the
// click's own onClick ever fires.
function AddressField({
  value,
  onChange,
  addressBook,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  addressBook: AddressBookEntry[];
  className: string;
}) {
  const [focused, setFocused] = useState(false);

  const query = value
    .slice(Math.max(value.lastIndexOf(","), value.lastIndexOf(";")) + 1)
    .trim()
    .toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    const already = value.toLowerCase();
    return addressBook
      .filter((a) => !already.includes(a.email.toLowerCase()) && (a.label.toLowerCase().includes(query) || a.email.toLowerCase().includes(query)))
      .slice(0, 6);
  }, [addressBook, query, value]);

  function pick(entry: AddressBookEntry) {
    const idx = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
    const prefix = idx >= 0 ? `${value.slice(0, idx + 1)} ` : "";
    onChange(`${prefix}${entry.label ? `${entry.label} <${entry.email}>` : entry.email}, `);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        className={`w-full ${className}`}
      />
      {focused && matches.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-y-auto rounded-md border border-card-border bg-card-bg shadow-lg">
          {matches.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(entry)}
              className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-amo-lime/10"
            >
              <span className="text-ink">{entry.label}</span>
              {entry.label && <span className="text-soft"> · </span>}
              <span className="text-soft">{entry.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// A real dropdown panel attached directly below the trigger — same
// "SingleSelect" pattern used elsewhere in the app (src/components/single-select.tsx)
// — rather than a native <select>, whose own open panel is entirely the
// OS/browser's to draw: on mobile that's typically a full-width sheet of
// radio buttons, not something that reads as "attached" to the field.
function FromDropdown({
  identities,
  value,
  onChange,
}: {
  identities: MailIdentity[];
  value: FromIdentity | null;
  onChange: (identity: FromIdentity) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const current = value && identities.find((id) => id.source === value.source && id.accountAddress === value.accountAddress);

  return (
    <div className="relative min-w-0 flex-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-card-border bg-field-bg px-3 py-1 text-sm text-ink"
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {current ? (current.displayName ? `${current.displayName} <${current.accountAddress}>` : current.accountAddress) : ""}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0 text-soft">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-card-border bg-card-bg p-1 shadow-lg">
          {identities.map((id) => (
            <button
              key={identityKey(id)}
              type="button"
              onClick={() => {
                onChange({ source: id.source, accountAddress: id.accountAddress });
                setOpen(false);
              }}
              className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-field-bg ${
                value && identityKey(value) === identityKey(id) ? "font-semibold text-ink" : "text-ink"
              }`}
            >
              {id.displayName ? `${id.displayName} <${id.accountAddress}>` : id.accountAddress}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  contactOptions,
  programOptions,
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
  // Powers the To/Cc/Bcc address-book autocomplete below — optional so
  // callers that don't have this data handy (e.g. a detail page's inline
  // reply) still get a working, if unassisted, compose dialog.
  contactOptions?: LinkOption[];
  programOptions?: LinkOption[];
  labels: EmailComposeLabels;
}) {
  const addressBook = useMemo(() => buildAddressBook(contactOptions ?? [], programOptions ?? []), [contactOptions, programOptions]);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  // Hidden by default on mobile behind an "Add cc" link (see the render
  // below) — but not when Cc already has a value (e.g. Reply All prefills
  // it), since hiding an already-populated field would hide who's cc'd
  // without any indication. Always visible at `sm` and up regardless.
  const [showCc, setShowCc] = useState(false);
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
  // For a brand-new email (no thread yet) the Linked-to choice is held here
  // until the message is sent, then saved against the thread Gmail returns.
  const [deferredLink, setDeferredLink] = useState<LinkValues | null>(null);

  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkExpanded(false);
    setDeferredLink(null);
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
      setShowCc(message.cc.length > 0);
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
    setShowCc(nextCc.length > 0);
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
          const lead = target.initialHtml ?? "";
          setHtml(signatureHtml ? `${lead}<p><br></p><p><br></p>${signatureHtml}` : lead);
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
    const chosen = deferredLink ?? (target.mode === "new" && target.linkConfig && !target.linkConfig.threadId ? target.linkConfig.initial : null);
    const sentThreadId = "threadId" in result && typeof result.threadId === "string" ? result.threadId : null;
    if (chosen && sentThreadId && (chosen.contactId || chosen.projectId || chosen.taskId || chosen.affiliateProgramId)) {
      await saveEmailLink(
        sentThreadId,
        { contactId: chosen.contactId, projectId: chosen.projectId, phaseId: chosen.phaseId, taskId: chosen.taskId, affiliateProgramId: chosen.affiliateProgramId },
        {
          subject,
          fromLabel: toList.join(", "),
          date: new Date().toISOString(),
          link: `https://mail.google.com/mail/u/0/#all/${sentThreadId}`,
          myAddress: fromIdentity?.accountAddress ?? null,
        }
      ).catch(() => undefined);
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

  const linkConfig: EmailLinkConfig | undefined =
    target.linkConfig && !target.linkConfig.threadId
      ? {
          ...target.linkConfig,
          initial: deferredLink ?? target.linkConfig.initial,
          current: linkTargetFor(target.linkConfig, deferredLink ?? target.linkConfig.initial),
          onSaved: (values) => setDeferredLink(values),
        }
      : target.linkConfig;
  const color = target.dotColor || NO_ADDRESS_COLOR;
  const fg = contrastTextColor(color);
  // fg is only ever black or white (contrastTextColor's whole job) — this
  // picks the border/hover treatment that stays visible against either,
  // same branch Calendar's own colored-header edit dialog uses.
  const headerBtnClass = fg === "#000000" ? "opacity-80 hover:opacity-100" : "opacity-90 hover:opacity-100";
  const identities = target.message.availableIdentities;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-2" onClick={onClose}>
      <div
        className="flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3" style={{ backgroundColor: color, color: fg }}>
          <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{title}</h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {target.draft && (
              <button
                type="button"
                disabled={discarding}
                onClick={handleDiscard}
                title={labels.discard}
                aria-label={labels.discard}
                className={`flex items-center justify-center rounded-lg p-2 disabled:opacity-60 ${headerBtnClass}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12" />
                </svg>
              </button>
            )}
            {!target.draft && (
              <button
                type="button"
                disabled={savingDraft}
                onClick={handleSaveDraft}
                title={savingDraft ? labels.savingDraft : labels.saveDraft}
                aria-label={savingDraft ? labels.savingDraft : labels.saveDraft}
                className={`flex items-center justify-center rounded-lg p-2 disabled:opacity-60 ${headerBtnClass}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 0 1 2-2h9l3 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v5h7V3M8 21v-6h8v6" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title={labels.cancel}
              aria-label={labels.cancel}
              className={`flex items-center justify-center rounded-lg p-2 ${headerBtnClass}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={handleSend}
              title={sending ? labels.sending : labels.send}
              aria-label={sending ? labels.sending : labels.send}
              className="btn-primary flex items-center justify-center rounded-lg p-2 shadow-sm disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3 3l18 9-18 9 3-9Zm0 0h9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Single scrollable column — From/To/Cc/Bcc/Subject, then the
            link summary + Attach button side by side (same "beside a
            row instead of a fixed side column" fix as the Read Email
            dialog's own Linked-to/Show-images row), then the link editor
            in place when open, then the body — all in plain flow so this
            is the dialog's only scrollbar, and an unusually tall editor
            can never clip its own Cancel/Save against the footer. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex shrink-0 flex-col gap-1 px-4 pb-2 pt-3">
            <div className="flex items-center gap-2">
              <label className="w-10 shrink-0 text-sm text-soft">{labels.from}</label>
              {identities.length > 1 ? (
                <FromDropdown identities={identities} value={fromIdentity} onChange={setFromIdentity} />
              ) : (
                <div className="min-w-0 flex-1 truncate rounded-md border border-card-border bg-field-bg px-3 py-1 text-sm text-ink">
                  {fromIdentity?.accountAddress ?? target.message.replyIdentity.accountAddress}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="w-10 shrink-0 text-sm text-soft">{labels.to}</label>
              <AddressField
                value={to}
                onChange={setTo}
                addressBook={addressBook}
                className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1 text-sm text-ink"
              />
            </div>

            {/* Cc: hidden by default on mobile behind "Add cc" below (not
                when it already has a value — see the showCc reasoning at
                its declaration); always shown at `sm` and up regardless. */}
            <div className={clsx("items-center gap-2", showCc ? "flex" : "hidden sm:flex")}>
              <label className="w-10 shrink-0 text-sm text-soft">{labels.cc}</label>
              <AddressField
                value={cc}
                onChange={setCc}
                addressBook={addressBook}
                className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1 text-sm text-ink"
              />
            </div>

            {showBcc && (
              <div className="flex items-center gap-2">
                <label className="w-10 shrink-0 text-sm text-soft">{labels.bcc}</label>
                <AddressField
                  value={bcc}
                  onChange={setBcc}
                  addressBook={addressBook}
                  className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1 text-sm text-ink"
                />
              </div>
            )}

            {/* Reveal links for whichever of Cc/Bcc is currently hidden —
                Add cc only ever matters on mobile (Cc always shows at
                `sm` and up), Add Bcc applies at every width since Bcc is
                hidden by default regardless of screen size. */}
            {(!showCc || !showBcc) && (
              <div className="flex items-center gap-3 pl-12">
                {!showCc && (
                  <button type="button" onClick={() => setShowCc(true)} className="text-xs text-soft hover:underline sm:hidden">
                    {labels.addCc}
                  </button>
                )}
                {!showBcc && (
                  <button type="button" onClick={() => setShowBcc(true)} className="text-xs text-soft hover:underline">
                    {labels.addBcc}
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="w-10 shrink-0 text-sm text-soft">{labels.subject}</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1 text-sm text-ink"
              />
            </div>

            <div className="flex items-start justify-between gap-3 border-t border-card-border pt-2">
              <div className="min-w-0 flex-1">
                {linkConfig && (
                  <EmailLinkSummary
                    current={linkConfig.current}
                    linkLabel={linkConfig.labels.link}
                    noneLabel={linkConfig.labels.none}
                    editLabel={linkConfig.labels.edit}
                    onEdit={() => setLinkExpanded((v) => !v)}
                  />
                )}
              </div>
              <label className="flex w-fit shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-card-border px-2 py-1 text-xs font-medium text-ink hover:bg-black/5">
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
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
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
            )}

            {/* Opens in place, pushing the body down — same treatment as
                the Read Email dialog's own link editor. */}
            {linkExpanded && linkConfig && (
              <div className="border-t border-card-border pt-2">
                <EmailLinkEditor config={linkConfig} onDone={() => setLinkExpanded(false)} />
              </div>
            )}
          </div>

          <div className="flex min-h-[220px] flex-1 flex-col px-4 pb-3">
            <RichTextarea value={html} onChange={setHtml} className="min-h-[220px]" defaultFontFamily={defaultFontFamily} defaultFontSize={defaultFontSize} />

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
