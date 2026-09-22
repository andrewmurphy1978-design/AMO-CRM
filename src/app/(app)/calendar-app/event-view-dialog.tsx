"use client";

import { useEffect, useState } from "react";
import { format, type Locale } from "date-fns";
import { eventColor } from "@/lib/calendar-colors";
import { formatTimeRange } from "@/lib/calendar-time";
import type { CalendarEventDetail } from "@/lib/google";
import { fetchCalendarEventDetail, deleteCalendarEventAction } from "@/actions/calendar";

export interface EventViewDialogLabels {
  loading: string;
  loadFailed: string;
  notConnected: string;
  edit: string;
  delete: string;
  close: string;
  deleteConfirm: string;
  busy: string;
  free: string;
  allDay: string;
  reminderDefault: string;
  reminderNone: string;
  reminderBefore: (n: number) => string;
  openInGoogleCalendar: string;
}

function IconRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-3 text-sm text-ink">
      <span className="mt-0.5 shrink-0 text-soft">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const DescriptionIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
    <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);
const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);
const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path strokeLinecap="round" d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);
const BriefcaseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
    <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 7.5V6a2 2 0 012-2h3a2 2 0 012 2v1.5M3.5 12.5h17" />
  </svg>
);
const LocationIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-6.5 7-11.5a7 7 0 10-14 0C5 14.5 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

export default function EventViewDialog({
  eventId,
  onClose,
  onEdit,
  onDeleted,
  hour12,
  dateLocale,
  intlLocale,
  labels,
}: {
  eventId: string | null;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  hour12: boolean;
  dateLocale: Locale | undefined;
  intlLocale: string;
  labels: EventViewDialogLabels;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalendarEventDetail | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(null);
    setDetail(null);
    fetchCalendarEventDetail(eventId).then((result) => {
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
  }, [eventId]);

  if (!eventId) return null;

  async function handleDelete() {
    if (!confirm(labels.deleteConfirm)) return;
    setDeleting(true);
    const result = await deleteCalendarEventAction(eventId!);
    setDeleting(false);
    if (!result.error) onDeleted();
  }

  const color = eventColor(detail?.colorId ?? null);
  const start = detail?.start ? new Date(detail.start) : null;
  const end = detail?.end ? new Date(detail.end) : null;

  const dateRange = (() => {
    if (!start) return "";
    if (detail?.allDay) {
      return format(start, "EEEE, MMMM d, yyyy", { locale: dateLocale });
    }
    const dayLabel = format(start, "EEEE, MMMM d, yyyy", { locale: dateLocale });
    const timeLabel = end ? formatTimeRange(start, end, hour12, intlLocale) : "";
    return `${dayLabel} · ${timeLabel}`;
  })();

  const reminderText = !detail
    ? ""
    : detail.reminderUseDefault
      ? labels.reminderDefault
      : detail.reminderMinutes == null
        ? labels.reminderNone
        : labels.reminderBefore(detail.reminderMinutes);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 w-full" style={{ backgroundColor: color.bg }} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-ink">{detail?.title ?? ""}</h3>
            <button type="button" onClick={onClose} aria-label={labels.close} className="shrink-0 rounded-full p-1 text-soft hover:bg-black/5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-soft">{labels.loading}</p>
          ) : loadError ? (
            <p className="mt-4 text-sm text-red-600">{loadError === "not_connected" ? labels.notConnected : labels.loadFailed}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink">{dateRange}</p>

              {detail?.location && (
                <IconRow icon={<LocationIcon />}>
                  <span className="break-words">{detail.location}</span>
                </IconRow>
              )}

              {detail?.description && (
                <IconRow icon={<DescriptionIcon />}>
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.bg }} />
                    <div className="min-w-0 flex-1 break-words" dangerouslySetInnerHTML={{ __html: detail.description }} />
                  </div>
                </IconRow>
              )}

              <IconRow icon={<BellIcon />}>{reminderText}</IconRow>

              {detail?.organizerName && <IconRow icon={<CalendarIcon />}>{detail.organizerName}</IconRow>}

              <IconRow icon={<BriefcaseIcon />}>{detail?.transparency === "transparent" ? labels.free : labels.busy}</IconRow>

              {detail?.htmlLink && (
                <a
                  href={detail.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block text-xs font-semibold text-amo-lime hover:underline"
                >
                  {labels.openInGoogleCalendar} ↗
                </a>
              )}
            </>
          )}

          <div className="mt-5 flex items-center justify-end gap-4 border-t border-card-border pt-4">
            <button type="button" disabled={deleting || loading} onClick={handleDelete} className="text-sm text-red-600 hover:underline disabled:opacity-60">
              {labels.delete}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-soft hover:underline">
              {labels.close}
            </button>
            <button type="button" disabled={loading} onClick={onEdit} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60">
              {labels.edit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
