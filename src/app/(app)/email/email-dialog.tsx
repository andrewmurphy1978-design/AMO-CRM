"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "@/lib/clsx";
import { format, type Locale } from "date-fns";
import { formatClockTime } from "@/lib/calendar-time";
import { fetchEmailDetail, downloadEmailAttachment, type EmailDetail } from "@/actions/email-messages";
import { NO_ADDRESS_COLOR, contrastTextColor } from "@/lib/email-address-match";
import EmailBodyFrame from "./email-body-frame";
import { EmailLinkSummary, EmailLinkEditor, type EmailLinkConfig } from "./email-link-fields";
import type { ComposeMode } from "./email-compose-dialog";
import { GmailIcon, IonosIcon } from "./mail-brand-icons";

export interface EmailDialogLabels {
  loading: string;
  loadFailed: string;
  notConnected: string;
  close: string;
  from: string;
  to: string;
  cc: string;
  showRemoteImages: string;
  noContent: string;
  openInGmail: string;
  openWebmail: string;
  attachments: string;
  reply: string;
  replyAll: string;
  forward: string;
  markComplete: string;
  markUncomplete: string;
}

export interface EmailDialogTarget {
  id: string;
  link: string; // the row's already-known Gmail thread URL — the dialog's own "Open in Gmail" fallback
  // Computed by the caller at click time (it already has the row's own
  // dot color and linked-entity data — see email-screening-view.tsx) rather
  // than recomputed here, so this dialog doesn't need addressColors/contact
  // option lists threaded into every place it's opened from.
  dotColor?: string | null;
  linkConfig?: EmailLinkConfig;
}

const AttachmentIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94a3 3 0 1 1 4.243 4.242L9.564 17.31a1.5 1.5 0 0 1-2.122-2.12l8.485-8.486"
    />
  </svg>
);

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Decodes the base64 payload downloadEmailAttachment returns into a Blob
// and saves it via a throwaway link click — the standard way to trigger a
// browser "Save As" from script-fetched bytes rather than a real <a href>.
function saveBase64File(filename: string, mimeType: string, base64: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// The Email page's "open a message" dialog — shell copied from
// calendar-app/event-view-dialog.tsx (backdrop + inner panel + Escape-to-
// close) for visual consistency with the rest of the app's dialogs.
export default function EmailDialog({
  target,
  onClose,
  onReply,
  onComplete,
  onUncomplete,
  completedLocked,
  dateLocale,
  intlLocale,
  hour12,
  labels,
}: {
  target: EmailDialogTarget | null;
  onClose: () => void;
  onReply: (detail: EmailDetail, mode: ComposeMode) => void;
  // Only one of onComplete/onUncomplete is ever passed for a given target —
  // whichever direction applies to its current state — same convention as
  // the row's own CompleteButton/UncompleteButton in email-screening-view.tsx,
  // so this single button can render as a toggle reflecting that state.
  onComplete?: () => void;
  onUncomplete?: () => void;
  // True for a sent thread Gmail marked completed by detecting a reply —
  // that state can't be undone from here, so it gets a static badge
  // instead of a clickable toggle (see completedLocked in email-screening-view.tsx).
  completedLocked?: boolean;
  dateLocale: Locale | undefined;
  intlLocale: string;
  hour12: boolean;
  labels: EmailDialogLabels;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [linkExpanded, setLinkExpanded] = useState(false);
  // Lifted out of EmailBodyFrame so its "Show images" button can live next
  // to the Linked-to summary in the header instead of floating above the
  // iframe — see email-body-frame.tsx's own comment on why it's controlled.
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(null);
    setDetail(null);
    setLinkExpanded(false);
    setAllowRemoteImages(false);
    fetchEmailDetail(target.id)
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          setLoadError(result.error);
        } else {
          setDetail(result);
        }
      })
      .catch(() => {
        // A rejected call (e.g. a transient Cloudflare/Hyperdrive error)
        // must still clear `loading` — otherwise the dialog is stuck on
        // "Loading message..." forever with no way to recover short of
        // closing it.
        if (!cancelled) setLoadError("load_failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    if (!target) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [target, onClose]);

  const hasRemoteImages = useMemo(
    () => (detail?.html ? /<img[^>]+src=["']https?:/i.test(detail.html) : false),
    [detail]
  );

  if (!target) return null;

  async function handleDownload(id: string, index: number) {
    setDownloadingIndex(index);
    const result = await downloadEmailAttachment(id, index);
    setDownloadingIndex(null);
    if (!("error" in result)) saveBase64File(result.filename, result.mimeType, result.base64);
  }

  // An "ionos:"-prefixed id (see EmailSummary's source comment in
  // google.ts) has no Gmail thread to deep-link to — the row/dialog's
  // own `link` for these already points at the generic IONOS webmail URL
  // instead, so only the label needs to change to match.
  const isIonos = target.id.startsWith("ionos:");

  const dateLabel = detail?.date
    ? `${format(new Date(detail.date), "EEEE, MMMM d, yyyy", { locale: dateLocale })} · ${formatClockTime(new Date(detail.date), hour12, intlLocale)}`
    : "";

  const color = target.dotColor || NO_ADDRESS_COLOR;
  const fg = contrastTextColor(color);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={clsx(
          "relative flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl",
          // Only switches to a fixed, generous height once there's real
          // content to lay out — while loading/erroring, the dialog stays
          // small (shrink-to-fit, capped) instead of popping in at full
          // size around a single line of text.
          detail ? "h-[88vh]" : "max-h-[85vh]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: color }} />
        <div className="flex shrink-0 items-start justify-between gap-2 px-5 py-4">
          <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-ink">{detail?.subject ?? ""}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="shrink-0 rounded-full p-1 hover:opacity-80"
            style={{ backgroundColor: color, color: fg }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {loading || loadError ? (
          <div className="min-h-0 flex-1 p-5">
            <p className="text-sm text-soft">
              {loading ? labels.loading : loadError === "not_connected" ? labels.notConnected : labels.loadFailed}
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* Header block — metadata, then the read-only link summary
                stacked below it (not beside it: a fixed side column here
                left almost no room for the metadata text on a phone-width
                dialog), then the link editor itself when open (see below).
                shrink-0 so it takes whatever height it naturally needs; the
                body below it keeps a small min-height floor rather than
                being allowed to shrink to nothing, so a very tall editor
                (e.g. with the contact search list open) makes this whole
                block scroll — via the wrapping div above — instead of
                clipping its own Cancel/Save against the dialog's edge. */}
            <div className="flex shrink-0 flex-col gap-3 px-5 pb-3">
              <div className="min-w-0 space-y-0.5 text-sm text-ink">
                <p>
                  <span className="text-soft">{labels.from}: </span>
                  {detail?.from.name ? `${detail.from.name} <${detail.from.email}>` : detail?.from.email}
                </p>
                {detail && detail.to.length > 0 && (
                  <p className="truncate">
                    <span className="text-soft">{labels.to}: </span>
                    {detail.to.join(", ")}
                  </p>
                )}
                {detail && detail.cc.length > 0 && (
                  <p className="truncate">
                    <span className="text-soft">{labels.cc}: </span>
                    {detail.cc.join(", ")}
                  </p>
                )}
                {dateLabel && <p className="text-soft">{dateLabel}</p>}

                {detail && detail.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    {detail.attachments.map((a, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleDownload(target.id, i)}
                        disabled={downloadingIndex === i}
                        title={a.filename}
                        className="flex items-center gap-1 rounded-full border border-card-border bg-field-bg px-2.5 py-1 text-xs text-ink hover:bg-black/5 disabled:opacity-60"
                      >
                        <AttachmentIcon />
                        <span className="max-w-[10rem] truncate">{a.filename}</span>
                        <span className="text-soft">({formatBytes(a.sizeBytes)})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {(target.linkConfig || (hasRemoteImages && !allowRemoteImages)) && (
                <div className="flex items-start justify-between gap-3 border-t border-card-border pt-3">
                  <div className="min-w-0 flex-1">
                    {target.linkConfig && (
                      <EmailLinkSummary
                        current={target.linkConfig.current}
                        linkLabel={target.linkConfig.labels.link}
                        noneLabel={target.linkConfig.labels.none}
                        editLabel={target.linkConfig.labels.edit}
                        onEdit={() => setLinkExpanded((v) => !v)}
                      />
                    )}
                  </div>
                  {hasRemoteImages && !allowRemoteImages && (
                    <button
                      type="button"
                      onClick={() => setAllowRemoteImages(true)}
                      className="shrink-0 rounded-md border border-card-border px-2 py-1 text-xs font-medium text-soft hover:bg-black/5"
                    >
                      {labels.showRemoteImages}
                    </button>
                  )}
                </div>
              )}

              {/* Opens in place, right below the summary above, pushing the
                  body down rather than sitting beside it in its own column —
                  its own content (a capped/scrollable contact search list,
                  a handful of selects) is naturally bounded, so this stays
                  shrink-0 without needing its own height cap: the body below
                  it is the dialog's only flex-1 area and just shrinks to
                  whatever room is left, same as it always does when the
                  attachments row or a long Cc list grows this section. */}
              {linkExpanded && target.linkConfig && (
                <div className="border-t border-card-border pt-3">
                  <EmailLinkEditor config={target.linkConfig} onDone={() => setLinkExpanded(false)} />
                </div>
              )}
            </div>

            {/* The body fills whatever's left of the dialog's height — its
                own iframe (see EmailBodyFrame) is normally the dialog's
                only scrollbar. min-h-[220px] is its floor: enough to still
                read a few lines rather than vanish outright when the
                editor above has pushed it down a lot. */}
            <div className="flex min-h-[220px] flex-1 flex-col px-5 pb-5">
              {detail?.html || detail?.text ? (
                <EmailBodyFrame html={detail.html} text={detail.text} allowRemoteImages={allowRemoteImages} />
              ) : (
                <p className="flex h-full items-center justify-center text-center text-sm text-soft">{labels.noContent}</p>
              )}
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between border-t border-card-border px-5 py-3">
          <a
            href={target.link}
            target="_blank"
            rel="noopener noreferrer"
            title={isIonos ? labels.openWebmail : labels.openInGmail}
            aria-label={isIonos ? labels.openWebmail : labels.openInGmail}
            className="flex shrink-0 items-center justify-center rounded-lg p-2 text-emerald-700 hover:bg-black/5"
          >
            {isIonos ? <IonosIcon className="h-4 w-4 shrink-0" /> : <GmailIcon className="h-4 w-4 shrink-0" />}
          </a>
          {detail && (
            <div className="flex items-center gap-1.5">
              {/* A toggle, not a one-way action: solid green with a white
                  check when the message is already complete (click to
                  undo), plain green check on white when it isn't (click to
                  mark done) — same convention as the row's own
                  CompleteButton/UncompleteButton in email-screening-view.tsx. */}
              {completedLocked ? (
                <span
                  title={labels.markComplete}
                  aria-label={labels.markComplete}
                  className="flex items-center justify-center rounded-lg bg-emerald-600 p-2 text-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75 10 18l9.5-12" />
                  </svg>
                </span>
              ) : onUncomplete ? (
                <button
                  type="button"
                  onClick={onUncomplete}
                  title={labels.markUncomplete}
                  aria-label={labels.markUncomplete}
                  className="flex items-center justify-center rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-700"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75 10 18l9.5-12" />
                  </svg>
                </button>
              ) : (
                onComplete && (
                  <button
                    type="button"
                    onClick={onComplete}
                    title={labels.markComplete}
                    aria-label={labels.markComplete}
                    className="flex items-center justify-center rounded-lg border border-card-border p-2 text-emerald-600 hover:bg-emerald-600/10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75 10 18l9.5-12" />
                    </svg>
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => onReply(detail, "reply")}
                title={labels.reply}
                aria-label={labels.reply}
                className="flex items-center justify-center rounded-lg border border-card-border p-2 text-ink hover:bg-black/5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onReply(detail, "replyAll")}
                title={labels.replyAll}
                aria-label={labels.replyAll}
                className="flex items-center justify-center rounded-lg border border-card-border p-2 text-ink hover:bg-black/5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15 7 10m0 0 5-5M7 10h9a6 6 0 0 1 6 6v1.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 15 3 10m5-5-5 5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onReply(detail, "forward")}
                title={labels.forward}
                aria-label={labels.forward}
                className="flex items-center justify-center rounded-lg border border-card-border p-2 text-ink hover:bg-black/5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
