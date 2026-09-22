"use client";

import { useEffect, useState } from "react";
import { format, type Locale } from "date-fns";
import { formatClockTime } from "@/lib/calendar-time";
import { fetchEmailDetail, downloadEmailAttachment, type EmailDetail } from "@/actions/email-messages";
import EmailBodyFrame from "./email-body-frame";
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
}

export interface EmailDialogTarget {
  id: string;
  link: string; // the row's already-known Gmail thread URL — the dialog's own "Open in Gmail" fallback
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
  dateLocale,
  intlLocale,
  hour12,
  labels,
}: {
  target: EmailDialogTarget | null;
  onClose: () => void;
  onReply: (detail: EmailDetail, mode: ComposeMode) => void;
  dateLocale: Locale | undefined;
  intlLocale: string;
  hour12: boolean;
  labels: EmailDialogLabels;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(null);
    setDetail(null);
    fetchEmailDetail(target.id).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setDetail(result);
      }
      setLoading(false);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-card-border px-5 py-4">
          <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-ink">{detail?.subject ?? ""}</h3>
          <button type="button" onClick={onClose} aria-label={labels.close} className="shrink-0 rounded-full p-1.5 text-soft hover:bg-black/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-soft">{labels.loading}</p>
          ) : loadError ? (
            <p className="text-sm text-red-600">{loadError === "not_connected" ? labels.notConnected : labels.loadFailed}</p>
          ) : (
            <>
              <div className="space-y-0.5 text-sm text-ink">
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
              </div>

              {detail && detail.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
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

              <div className="mt-4">
                {detail?.html || detail?.text ? (
                  <EmailBodyFrame html={detail.html} text={detail.text} showRemoteImagesLabel={labels.showRemoteImages} />
                ) : (
                  <p className="text-sm text-soft">{labels.noContent}</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-card-border px-5 py-3">
          <a
            href={target.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
          >
            {isIonos ? <IonosIcon className="h-3.5 w-3.5 shrink-0" /> : <GmailIcon className="h-3.5 w-3.5 shrink-0" />}
            {isIonos ? labels.openWebmail : labels.openInGmail} ↗
          </a>
          <div className="flex items-center gap-2">
            {detail && (
              <>
                <button
                  type="button"
                  onClick={() => onReply(detail, "reply")}
                  className="rounded-lg border border-card-border px-3 py-2 text-sm font-medium text-ink hover:bg-black/5"
                >
                  {labels.reply}
                </button>
                <button
                  type="button"
                  onClick={() => onReply(detail, "replyAll")}
                  className="rounded-lg border border-card-border px-3 py-2 text-sm font-medium text-ink hover:bg-black/5"
                >
                  {labels.replyAll}
                </button>
                <button
                  type="button"
                  onClick={() => onReply(detail, "forward")}
                  className="rounded-lg border border-card-border px-3 py-2 text-sm font-medium text-ink hover:bg-black/5"
                >
                  {labels.forward}
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5">
              {labels.close}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
