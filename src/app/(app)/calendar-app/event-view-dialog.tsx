"use client";

import { useEffect, useState } from "react";
import { format, type Locale } from "date-fns";
import { eventColor } from "@/lib/calendar-colors";
import { formatTimeRange } from "@/lib/calendar-time";
import { formatReminderList, type ReminderLabels } from "@/lib/calendar-reminders";
import type { CalendarAttendee, CalendarEventDetail } from "@/lib/google";
import { fetchCalendarEventDetail, fetchDefaultReminders, deleteCalendarEventAction, type EventLinkTargets } from "@/actions/calendar";
import type { LinkOption } from "../link-dialog";

export interface EventViewDialogLabels extends ReminderLabels {
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
  guests: string;
  linkedTo: string;
  openInGoogleCalendar: string;
  repeatDaily: string;
  repeatWeeklyOn: string; // "Weekly on {day}"
  repeatMonthlyOn: string; // "Monthly on day {day}"
  repeatYearlyOn: string; // "Yearly on {date}"
}

// "Andrew Murphy (andrewmurphy1978@gmail.com)" when the address matches a
// known contact; otherwise Google's own displayName for that guest, or
// just the bare email when neither is available.
function guestDisplay(a: CalendarAttendee, contacts: LinkOption[]): string {
  const match = contacts.find((c) => c.email && c.email.toLowerCase() === a.email.toLowerCase());
  if (match) return `${match.label} (${a.email})`;
  if (a.displayName) return `${a.displayName} (${a.email})`;
  return a.email;
}

// A short description of the event's own RRULE, the way Google Calendar's
// popup shows it under the date/time line ("Weekly on Thursday"). Only
// handles the plain FREQ cases this app's own Repeat picker can create —
// good enough for events made in this app; an RRULE with BYDAY/INTERVAL/
// COUNT from elsewhere just falls back to the FREQ-only phrasing.
function describeRecurrence(recurrence: string[], start: Date | null, dateLocale: Locale | undefined, labels: EventViewDialogLabels): string | null {
  const rule = recurrence.find((r) => r.startsWith("RRULE:"));
  if (!rule || !start) return null;
  if (rule.includes("FREQ=DAILY")) return labels.repeatDaily;
  if (rule.includes("FREQ=WEEKLY")) return labels.repeatWeeklyOn.replace("{day}", format(start, "EEEE", { locale: dateLocale }));
  if (rule.includes("FREQ=MONTHLY")) return labels.repeatMonthlyOn.replace("{day}", format(start, "d", { locale: dateLocale }));
  if (rule.includes("FREQ=YEARLY")) return labels.repeatYearlyOn.replace("{date}", format(start, "MMMM d", { locale: dateLocale }));
  return null;
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
const PeopleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
    <circle cx="9" cy="8" r="3" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19a5.5 5.5 0 0111 0M15 8.5a2.5 2.5 0 110-5M17 19a4.5 4.5 0 00-3.5-4.4" />
  </svg>
);
const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
    <circle cx="8" cy="16" r="4" />
    <circle cx="16" cy="8" r="4" />
    <path strokeLinecap="round" d="M10.8 13.2 13.2 10.8" />
  </svg>
);

export default function EventViewDialog({
  eventId,
  links,
  contacts,
  projects,
  tasks,
  bookings,
  onClose,
  onEdit,
  onDeleted,
  hour12,
  dateLocale,
  intlLocale,
  labels,
}: {
  eventId: string | null;
  // Known CRM links for this event, from the calendar's own already-
  // fetched map (same raw ids the edit dialog prefills from).
  links?: EventLinkTargets;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  bookings: LinkOption[];
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
  const [defaultReminders, setDefaultReminders] = useState<number[]>([]);
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
    fetchDefaultReminders().then((result) => {
      if (!cancelled && !("error" in result)) setDefaultReminders(result.minutes);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [eventId, onClose]);

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

  const reminderText = !detail ? "" : formatReminderList(detail.reminderUseDefault ? defaultReminders : detail.reminderOverrides, labels);
  const repeatText = detail ? describeRecurrence(detail.recurrence, start, dateLocale, labels) : null;

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
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.close}
              className="shrink-0 rounded-full p-1 hover:opacity-80"
              style={{ backgroundColor: color.bg, color: color.fg }}
            >
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
              {repeatText && <p className="text-sm text-ink">{repeatText}</p>}

              {detail?.location && (
                <IconRow icon={<LocationIcon />}>
                  <span className="break-words">{detail.location}</span>
                </IconRow>
              )}

              {detail?.attendees && detail.attendees.length > 0 && (
                <IconRow icon={<PeopleIcon />}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-soft">{labels.guests}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {detail.attendees.map((a) => (
                      <li key={a.email} className="truncate">
                        {guestDisplay(a, contacts)}
                      </li>
                    ))}
                  </ul>
                </IconRow>
              )}

              {links && (links.contactId || links.projectId || links.taskId || links.bookingId) && (
                <IconRow icon={<LinkIcon />}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-soft">{labels.linkedTo}</p>
                  <div className="mt-0.5 space-y-0.5">
                    {links.contactId && <div className="truncate">{contacts.find((c) => c.id === links.contactId)?.label}</div>}
                    {links.projectId && <div className="truncate">{projects.find((p) => p.id === links.projectId)?.label}</div>}
                    {links.taskId && <div className="truncate">{tasks.find((tk) => tk.id === links.taskId)?.label}</div>}
                    {links.bookingId && <div className="truncate">{bookings.find((b) => b.id === links.bookingId)?.label}</div>}
                  </div>
                </IconRow>
              )}

              {detail?.description && (
                <IconRow icon={<DescriptionIcon />}>
                  <div
                    className="min-w-0 flex-1 break-words rounded-r-md py-1 pl-3"
                    style={{ borderLeft: `3px solid ${color.bg}` }}
                    dangerouslySetInnerHTML={{ __html: detail.description }}
                  />
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

          <div className="mt-5 flex items-center justify-between border-t border-card-border pt-4">
            <button
              type="button"
              disabled={deleting || loading}
              onClick={handleDelete}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              {labels.delete}
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
