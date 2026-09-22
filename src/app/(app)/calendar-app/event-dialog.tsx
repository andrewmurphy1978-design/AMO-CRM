"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { EVENT_COLOR_OPTIONS, GOOGLE_EVENT_COLORS, DEFAULT_EVENT_COLOR } from "@/lib/calendar-colors";
import ColorSelect, { type ColorOption } from "@/components/color-select";
import RichTextarea from "@/components/rich-textarea";
import type { CalendarEventInput, CalendarEventDetail } from "@/lib/google";
import {
  fetchCalendarEventDetail,
  createCalendarEventAction,
  updateCalendarEventAction,
  deleteCalendarEventAction,
  type EventLinkTargets,
} from "@/actions/calendar";
import type { LinkOption } from "../link-dialog";

export type EventDialogTarget = { id: string } | { start: Date };

type RepeatPreset = "none" | "daily" | "weekly" | "monthly" | "yearly";
type ReminderPreset = "default" | "none" | "10" | "30" | "60" | "1440";

const REPEAT_RRULE: Record<Exclude<RepeatPreset, "none">, string> = {
  daily: "RRULE:FREQ=DAILY",
  weekly: "RRULE:FREQ=WEEKLY",
  monthly: "RRULE:FREQ=MONTHLY",
  yearly: "RRULE:FREQ=YEARLY",
};

function repeatPresetFromRrule(recurrence: string[]): RepeatPreset {
  const rule = recurrence.find((r) => r.startsWith("RRULE:"));
  if (!rule) return "none";
  if (rule.includes("FREQ=DAILY")) return "daily";
  if (rule.includes("FREQ=WEEKLY")) return "weekly";
  if (rule.includes("FREQ=MONTHLY")) return "monthly";
  if (rule.includes("FREQ=YEARLY")) return "yearly";
  return "none";
}

function reminderPresetFrom(useDefault: boolean, minutes: number | null): ReminderPreset {
  if (useDefault) return "default";
  if (minutes == null) return "none";
  if (minutes === 10 || minutes === 30 || minutes === 60 || minutes === 1440) return String(minutes) as ReminderPreset;
  return "none";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/Montreal",
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
];

function listTimeZones(): string[] {
  try {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof supportedValuesOf === "function") return supportedValuesOf("timeZone");
  } catch {
    // fall through to the fallback list below
  }
  return FALLBACK_TIME_ZONES;
}

// Extracts the wall-clock date/time an instant reads as in a *specific*
// IANA zone — plain `Date` getters only ever give the browser's own local
// zone, which is exactly what a per-event timezone picker needs to not be
// tied to. `en-CA` conveniently formats as yyyy-mm-dd.
function wallClockInZone(date: Date, timeZone: string): { date: string; time: string } {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}` };
  } catch {
    return { date: toDateInput(date), time: toTimeInput(date) };
  }
}

interface FormState {
  title: string;
  description: string; // HTML
  location: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: string;
  colorId: string;
  repeat: RepeatPreset;
  reminder: ReminderPreset;
  transparency: "opaque" | "transparent";
  visibility: "default" | "public" | "private";
  attendeeEmails: string[];
  contactId: string;
  projectId: string;
  taskId: string;
  bookingId: string;
}

function blankState(start: Date): FormState {
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    title: "",
    description: "",
    location: "",
    allDay: false,
    startDate: toDateInput(start),
    startTime: toTimeInput(start),
    endDate: toDateInput(end),
    endTime: toTimeInput(end),
    timeZone: browserTimeZone(),
    colorId: "",
    repeat: "none",
    reminder: "default",
    transparency: "opaque",
    visibility: "default",
    attendeeEmails: [],
    contactId: "",
    projectId: "",
    taskId: "",
    bookingId: "",
  };
}

function stateFromDetail(detail: CalendarEventDetail, links: EventLinkTargets): FormState {
  const timeZone = detail.timeZone ?? browserTimeZone();
  const start = detail.start ? new Date(detail.start) : new Date();
  const end = detail.end ? new Date(detail.end) : new Date(start.getTime() + 30 * 60 * 1000);
  const startWall = detail.allDay ? { date: toDateInput(start), time: "00:00" } : wallClockInZone(start, timeZone);
  const endWall = detail.allDay ? { date: toDateInput(end), time: "00:00" } : wallClockInZone(end, timeZone);
  return {
    title: detail.title === "(untitled)" ? "" : detail.title,
    description: detail.description,
    location: detail.location,
    allDay: detail.allDay,
    startDate: startWall.date,
    startTime: startWall.time,
    endDate: endWall.date,
    endTime: endWall.time,
    timeZone,
    colorId: detail.colorId ?? "",
    repeat: repeatPresetFromRrule(detail.recurrence),
    reminder: reminderPresetFrom(detail.reminderUseDefault, detail.reminderMinutes),
    transparency: detail.transparency,
    visibility: detail.visibility,
    attendeeEmails: detail.attendees.map((a) => a.email).filter(Boolean),
    contactId: links.contactId,
    projectId: links.projectId,
    taskId: links.taskId,
    bookingId: links.bookingId,
  };
}

export interface EventDialogLabels {
  createTitle: string;
  editTitle: string;
  loading: string;
  titleLabel: string;
  titlePlaceholder: string;
  allDay: string;
  start: string;
  end: string;
  to: string;
  timeZone: string;
  location: string;
  locationPlaceholder: string;
  viewOnMap: string;
  description: string;
  calendar: string;
  color: string;
  defaultColor: string;
  repeat: string;
  repeatNone: string;
  repeatDaily: string;
  repeatWeekly: string;
  repeatMonthly: string;
  repeatYearly: string;
  repeatLockedNotice: string;
  reminder: string;
  reminderDefault: string;
  reminderNone: string;
  reminderMinutes10: string;
  reminderMinutes30: string;
  reminderHours1: string;
  reminderDay1: string;
  busyFree: string;
  busy: string;
  free: string;
  visibility: string;
  visibilityDefault: string;
  visibilityPublic: string;
  visibilityPrivate: string;
  guests: string;
  guestEmailPlaceholder: string;
  addGuest: string;
  linkTo: string;
  openInGoogleCalendar: string;
  save: string;
  saving: string;
  cancel: string;
  delete: string;
  deleteConfirm: string;
  notConnected: string;
  loadFailed: string;
  saved: string;
  deleted: string;
}

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

export default function EventDialog({
  target,
  initialLinks,
  calendarName,
  onClose,
  onSaved,
  onDeleted,
  contacts,
  projects,
  tasks,
  bookings,
  lang,
  labels,
  linkLabels,
}: {
  target: EventDialogTarget | null;
  // Known CRM links for an existing event, from the calendar's own already-
  // fetched map — fetchCalendarEventDetail only talks to Google, which has
  // no idea about these, so without this the edit dialog would silently
  // wipe an event's existing contact/project/task/booking link on every save.
  initialLinks?: EventLinkTargets;
  // The connected Google account's own display name — this app only ever
  // touches the "primary" calendar, so this doubles as that calendar's name
  // (there's no per-event fetch for it; a new event has no organizer yet).
  calendarName?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  bookings: LinkOption[];
  lang: Lang;
  labels: EventDialogLabels;
  linkLabels: { contact: string; project: string; task: string; booking: string; none: string; clear: string; searchPlaceholder: string; noResults: string };
}) {
  const t = getDict(lang);
  const isEdit = target !== null && "id" in target;
  const eventId = target && "id" in target ? target.id : null;

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalendarEventDetail | null>(null);
  const [form, setForm] = useState<FormState>(() => (target && "start" in target ? blankState(target.start) : blankState(new Date())));
  const [contactSearch, setContactSearch] = useState("");
  const [guestInput, setGuestInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const timeZones = useMemo(() => listTimeZones(), []);

  useEffect(() => {
    if (!target || "start" in target) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(null);
    fetchCalendarEventDetail(target.id).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      setDetail(result);
      setForm(stateFromDetail(result, initialLinks ?? { contactId: "", projectId: "", taskId: "", bookingId: "" }));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target && "id" in target ? target.id : target && "start" in target ? target.start.getTime() : null]);

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const list = q ? contacts.filter((c) => c.label.toLowerCase().includes(q)) : contacts;
    return list.slice(0, 20);
  }, [contactSearch, contacts]);

  const availableProjects = useMemo(
    () => (form.contactId ? projects.filter((p) => p.contactId === form.contactId) : []),
    [projects, form.contactId]
  );
  const availableTasks = useMemo(() => (form.projectId ? tasks.filter((tk) => tk.projectId === form.projectId) : []), [tasks, form.projectId]);
  const availableBookings = useMemo(
    () => (form.contactId ? bookings.filter((b) => b.contactId === form.contactId) : []),
    [bookings, form.contactId]
  );
  const selectedContact = contacts.find((c) => c.id === form.contactId) ?? null;

  const colorOptions: ColorOption[] = useMemo(
    () => [
      { value: "", label: labels.defaultColor, swatch: DEFAULT_EVENT_COLOR.bg },
      ...EVENT_COLOR_OPTIONS.map((c) => ({ value: c.id, label: c.name, swatch: GOOGLE_EVENT_COLORS[c.id].bg })),
    ],
    [labels.defaultColor]
  );

  if (!target) return null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleAllDay(checked: boolean) {
    update("allDay", checked);
  }

  function addGuest() {
    const email = guestInput.trim();
    if (!email || form.attendeeEmails.includes(email)) return;
    update("attendeeEmails", [...form.attendeeEmails, email]);
    setGuestInput("");
  }

  function buildInput(): CalendarEventInput {
    const reminderUseDefault = form.reminder === "default";
    const reminderMinutes = reminderUseDefault || form.reminder === "none" ? null : Number(form.reminder);
    const start = form.allDay ? form.startDate : `${form.startDate}T${form.startTime}:00`;
    const end = form.allDay ? form.endDate : `${form.endDate}T${form.endTime}:00`;
    return {
      title: form.title.trim() || "(untitled)",
      description: form.description,
      location: form.location,
      allDay: form.allDay,
      start,
      end,
      timeZone: form.timeZone,
      colorId: form.colorId || null,
      attendeeEmails: form.attendeeEmails,
      recurrence: form.repeat === "none" ? [] : [REPEAT_RRULE[form.repeat]],
      visibility: form.visibility,
      transparency: form.transparency,
      reminderUseDefault,
      reminderMinutes,
    };
  }

  function links(): EventLinkTargets {
    return { contactId: form.contactId, projectId: form.projectId, taskId: form.taskId, bookingId: form.bookingId };
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const input = buildInput();
      const result = eventId ? await updateCalendarEventAction(eventId, input, links()) : await createCalendarEventAction(input, links());
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  function remove() {
    if (!eventId) return;
    if (!confirm(labels.deleteConfirm)) return;
    startTransition(async () => {
      const result = await deleteCalendarEventAction(eventId);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDeleted();
      onClose();
    });
  }

  const isRecurringInstance = Boolean(detail?.recurringEventId);
  const mapsUrl = form.location.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.location.trim())}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ink">{isEdit ? labels.editTitle : labels.createTitle}</h3>
          {!loading && !loadError && (
            <div className="flex items-center gap-3">
              {isEdit && (
                <button type="button" disabled={pending} onClick={remove} className="text-sm text-red-600 hover:underline disabled:opacity-60">
                  {labels.delete}
                </button>
              )}
              <button type="button" onClick={onClose} className="text-sm text-soft hover:underline">
                {labels.cancel}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={save}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
              >
                {pending ? labels.saving : labels.save}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-soft">{labels.loading}</p>
        ) : loadError ? (
          <p className="mt-4 text-sm text-red-600">{loadError === "not_connected" ? labels.notConnected : labels.loadFailed}</p>
        ) : (
          <div className="mt-4 grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="min-w-0 space-y-4">
              <input
                type="text"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder={labels.titlePlaceholder}
                className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-base font-medium text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
              />

              {/* Date/time row + All day + Repeat, all grouped together like
                  Google's own event editor keeps its date/time controls. */}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} className="rounded-md border border-card-border bg-field-bg px-2.5 py-1.5 text-sm text-ink shadow-sm" />
                  {!form.allDay && (
                    <input type="time" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} className="rounded-md border border-card-border bg-field-bg px-2.5 py-1.5 text-sm text-ink shadow-sm" />
                  )}
                  <span className="text-sm text-soft">{labels.to}</span>
                  {!form.allDay && (
                    <input type="time" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} className="rounded-md border border-card-border bg-field-bg px-2.5 py-1.5 text-sm text-ink shadow-sm" />
                  )}
                  <input type="date" value={form.endDate} onChange={(e) => update("endDate", e.target.value)} className="rounded-md border border-card-border bg-field-bg px-2.5 py-1.5 text-sm text-ink shadow-sm" />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={form.allDay} onChange={(e) => toggleAllDay(e.target.checked)} className="h-4 w-4 rounded border-card-border" />
                    {labels.allDay}
                  </label>

                  {!form.allDay && (
                    <select value={form.timeZone} onChange={(e) => update("timeZone", e.target.value)} className="rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-xs text-ink shadow-sm">
                      {!timeZones.includes(form.timeZone) && <option value={form.timeZone}>{form.timeZone}</option>}
                      {timeZones.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  )}

                  {isRecurringInstance ? (
                    <span className="rounded-md border border-card-border bg-black/[0.02] px-2.5 py-1.5 text-xs text-soft">{labels.repeatLockedNotice}</span>
                  ) : (
                    <select value={form.repeat} onChange={(e) => update("repeat", e.target.value as RepeatPreset)} className="rounded-md border border-card-border bg-field-bg px-2.5 py-1.5 text-sm text-ink shadow-sm">
                      <option value="none">{labels.repeatNone}</option>
                      <option value="daily">{labels.repeatDaily}</option>
                      <option value="weekly">{labels.repeatWeekly}</option>
                      <option value="monthly">{labels.repeatMonthly}</option>
                      <option value="yearly">{labels.repeatYearly}</option>
                    </select>
                  )}

                  <select value={form.reminder} onChange={(e) => update("reminder", e.target.value as ReminderPreset)} className="rounded-md border border-card-border bg-field-bg px-2.5 py-1.5 text-sm text-ink shadow-sm">
                    <option value="default">{labels.reminderDefault}</option>
                    <option value="none">{labels.reminderNone}</option>
                    <option value="10">{labels.reminderMinutes10}</option>
                    <option value="30">{labels.reminderMinutes30}</option>
                    <option value="60">{labels.reminderHours1}</option>
                    <option value="1440">{labels.reminderDay1}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>{labels.location}</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => update("location", e.target.value)}
                    placeholder={labels.locationPlaceholder}
                    className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
                  />
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" title={labels.viewOnMap} className="shrink-0 rounded-md border border-card-border p-2 text-soft hover:bg-black/5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-6.5 7-11.5a7 7 0 10-14 0C5 14.5 12 21 12 21z" />
                        <circle cx="12" cy="9.5" r="2.5" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>{labels.calendar}</label>
                  <p className={`${FIELD_CLASS} truncate bg-black/[0.02] text-soft`}>{detail?.organizerName ?? calendarName ?? ""}</p>
                </div>
                <div>
                  <label className={LABEL_CLASS}>{labels.color}</label>
                  <ColorSelect options={colorOptions} value={form.colorId} onChange={(v) => update("colorId", v)} className="mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>{labels.busyFree}</label>
                  <select value={form.transparency} onChange={(e) => update("transparency", e.target.value as FormState["transparency"])} className={FIELD_CLASS}>
                    <option value="opaque">{labels.busy}</option>
                    <option value="transparent">{labels.free}</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>{labels.visibility}</label>
                  <select value={form.visibility} onChange={(e) => update("visibility", e.target.value as FormState["visibility"])} className={FIELD_CLASS}>
                    <option value="default">{labels.visibilityDefault}</option>
                    <option value="public">{labels.visibilityPublic}</option>
                    <option value="private">{labels.visibilityPrivate}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>{labels.guests}</label>
                {form.attendeeEmails.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {form.attendeeEmails.map((email) => (
                      <li key={email} className="flex items-center justify-between rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink">
                        <span className="truncate">{email}</span>
                        <button type="button" onClick={() => update("attendeeEmails", form.attendeeEmails.filter((e) => e !== email))} className="ml-2 shrink-0 text-xs text-soft hover:underline">
                          {t.contactForm.removeEntry}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="email"
                    value={guestInput}
                    onChange={(e) => setGuestInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addGuest();
                      }
                    }}
                    placeholder={labels.guestEmailPlaceholder}
                    className="flex-1 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
                  />
                  <button type="button" onClick={addGuest} className="rounded-md border border-card-border px-3 py-2 text-xs font-medium text-ink hover:bg-black/5">
                    {labels.addGuest}
                  </button>
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>{labels.description}</label>
                <RichTextarea value={form.description} onChange={(html) => update("description", html)} className="mt-1" />
              </div>

              {detail?.htmlLink && (
                <a href={detail.htmlLink} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-semibold text-amo-lime hover:underline">
                  {labels.openInGoogleCalendar} ↗
                </a>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="min-w-0 space-y-3 border-t border-card-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <label className={LABEL_CLASS}>{labels.linkTo}</label>

              <div>
                {selectedContact ? (
                  <div className="flex items-center justify-between rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink">
                    <span className="truncate">{selectedContact.label}</span>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, contactId: "", projectId: "", taskId: "", bookingId: "" }))} className="ml-2 shrink-0 text-xs text-soft hover:underline">
                      {linkLabels.clear}
                    </button>
                  </div>
                ) : (
                  <>
                    <input type="text" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder={linkLabels.searchPlaceholder} className={FIELD_CLASS} />
                    <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-card-border">
                      {filteredContacts.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-soft">{linkLabels.noResults}</p>
                      ) : (
                        filteredContacts.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setForm((f) => ({ ...f, contactId: c.id, projectId: "", taskId: "", bookingId: "" }));
                              setContactSearch("");
                            }}
                            className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-amo-lime/10"
                          >
                            {c.label}
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className={LABEL_CLASS}>{linkLabels.project}</label>
                <select value={form.projectId} onChange={(e) => update("projectId", e.target.value)} disabled={!form.contactId} className={`${FIELD_CLASS} disabled:opacity-50`}>
                  <option value="">{linkLabels.none}</option>
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>{linkLabels.task}</label>
                <select value={form.taskId} onChange={(e) => update("taskId", e.target.value)} disabled={!form.projectId} className={`${FIELD_CLASS} disabled:opacity-50`}>
                  <option value="">{linkLabels.none}</option>
                  {availableTasks.map((tk) => (
                    <option key={tk.id} value={tk.id}>
                      {tk.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>{linkLabels.booking}</label>
                <select value={form.bookingId} onChange={(e) => update("bookingId", e.target.value)} disabled={!form.contactId} className={`${FIELD_CLASS} disabled:opacity-50`}>
                  <option value="">{linkLabels.none}</option>
                  {availableBookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
