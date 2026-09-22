"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { EVENT_COLOR_OPTIONS } from "@/lib/calendar-colors";
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

function toDateTimeLocalInput(d: Date): string {
  return `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseGoogleDateOrDateTime(value: string, allDay: boolean): string {
  if (allDay) return value.slice(0, 10);
  return new Date(value).toISOString();
}

interface FormState {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startInput: string; // date or datetime-local string, in the input's own format
  endInput: string;
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
    startInput: toDateTimeLocalInput(start),
    endInput: toDateTimeLocalInput(end),
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
  const start = detail.start ? new Date(detail.start) : new Date();
  const end = detail.end ? new Date(detail.end) : new Date(start.getTime() + 30 * 60 * 1000);
  return {
    title: detail.title === "(untitled)" ? "" : detail.title,
    description: detail.description,
    location: detail.location,
    allDay: detail.allDay,
    startInput: detail.allDay ? toDateInput(start) : toDateTimeLocalInput(start),
    endInput: detail.allDay ? toDateInput(end) : toDateTimeLocalInput(end),
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
  location: string;
  locationPlaceholder: string;
  description: string;
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
}

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

export default function EventDialog({
  target,
  onClose,
  onSaved,
  contacts,
  projects,
  tasks,
  bookings,
  lang,
  labels,
  linkLabels,
}: {
  target: EventDialogTarget | null;
  onClose: () => void;
  onSaved: () => void;
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

  useEffect(() => {
    // Only the "edit an existing event" case needs to fetch anything — the
    // "create" case's initial state already came from blankState(target.start)
    // via the lazy useState initializer above, and the parent remounts this
    // whole component (via a `key` keyed on the target) whenever it changes,
    // so there's nothing left to synchronize here for that branch.
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
      setForm(stateFromDetail(result, { contactId: "", projectId: "", taskId: "", bookingId: "" }));
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

  if (!target) return null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleAllDay(checked: boolean) {
    setForm((f) => {
      if (checked) {
        const start = f.startInput ? new Date(f.startInput) : new Date();
        const end = f.endInput ? new Date(f.endInput) : start;
        return { ...f, allDay: true, startInput: toDateInput(start), endInput: toDateInput(end) };
      }
      const start = f.startInput ? new Date(`${f.startInput}T09:00`) : new Date();
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      return { ...f, allDay: false, startInput: toDateTimeLocalInput(start), endInput: toDateTimeLocalInput(end) };
    });
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
    return {
      title: form.title.trim() || "(untitled)",
      description: form.description,
      location: form.location,
      allDay: form.allDay,
      start: parseGoogleDateOrDateTime(form.startInput, form.allDay),
      end: parseGoogleDateOrDateTime(form.endInput, form.allDay),
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
      onSaved();
      onClose();
    });
  }

  const isRecurringInstance = Boolean(detail?.recurringEventId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-semibold text-ink">{isEdit ? labels.editTitle : labels.createTitle}</h3>

        {loading ? (
          <p className="mt-4 text-sm text-soft">{labels.loading}</p>
        ) : loadError ? (
          <p className="mt-4 text-sm text-red-600">{loadError === "not_connected" ? labels.notConnected : labels.loadFailed}</p>
        ) : (
          <>
            <div className="mt-4">
              <input
                type="text"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder={labels.titlePlaceholder}
                className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-base font-medium text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
              />
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => toggleAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-card-border"
              />
              {labels.allDay}
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLASS}>{labels.start}</label>
                <input
                  type={form.allDay ? "date" : "datetime-local"}
                  value={form.startInput}
                  onChange={(e) => update("startInput", e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>{labels.end}</label>
                <input
                  type={form.allDay ? "date" : "datetime-local"}
                  value={form.endInput}
                  onChange={(e) => update("endInput", e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className={LABEL_CLASS}>{labels.location}</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder={labels.locationPlaceholder}
                className={FIELD_CLASS}
              />
            </div>

            <div className="mt-3">
              <label className={LABEL_CLASS}>{labels.description}</label>
              <textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} className={FIELD_CLASS} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLASS}>{labels.color}</label>
                <select value={form.colorId} onChange={(e) => update("colorId", e.target.value)} className={FIELD_CLASS}>
                  <option value="">{labels.defaultColor}</option>
                  {EVENT_COLOR_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>{labels.busyFree}</label>
                <select
                  value={form.transparency}
                  onChange={(e) => update("transparency", e.target.value as FormState["transparency"])}
                  className={FIELD_CLASS}
                >
                  <option value="opaque">{labels.busy}</option>
                  <option value="transparent">{labels.free}</option>
                </select>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLASS}>{labels.repeat}</label>
                {isRecurringInstance ? (
                  <p className="mt-1 rounded-md border border-card-border bg-black/[0.02] px-3 py-2 text-xs text-soft">
                    {labels.repeatLockedNotice}
                  </p>
                ) : (
                  <select value={form.repeat} onChange={(e) => update("repeat", e.target.value as RepeatPreset)} className={FIELD_CLASS}>
                    <option value="none">{labels.repeatNone}</option>
                    <option value="daily">{labels.repeatDaily}</option>
                    <option value="weekly">{labels.repeatWeekly}</option>
                    <option value="monthly">{labels.repeatMonthly}</option>
                    <option value="yearly">{labels.repeatYearly}</option>
                  </select>
                )}
              </div>
              <div>
                <label className={LABEL_CLASS}>{labels.reminder}</label>
                <select value={form.reminder} onChange={(e) => update("reminder", e.target.value as ReminderPreset)} className={FIELD_CLASS}>
                  <option value="default">{labels.reminderDefault}</option>
                  <option value="none">{labels.reminderNone}</option>
                  <option value="10">{labels.reminderMinutes10}</option>
                  <option value="30">{labels.reminderMinutes30}</option>
                  <option value="60">{labels.reminderHours1}</option>
                  <option value="1440">{labels.reminderDay1}</option>
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className={LABEL_CLASS}>{labels.visibility}</label>
              <select
                value={form.visibility}
                onChange={(e) => update("visibility", e.target.value as FormState["visibility"])}
                className={FIELD_CLASS}
              >
                <option value="default">{labels.visibilityDefault}</option>
                <option value="public">{labels.visibilityPublic}</option>
                <option value="private">{labels.visibilityPrivate}</option>
              </select>
            </div>

            <div className="mt-3">
              <label className={LABEL_CLASS}>{labels.guests}</label>
              {form.attendeeEmails.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {form.attendeeEmails.map((email) => (
                    <li key={email} className="flex items-center justify-between rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink">
                      <span className="truncate">{email}</span>
                      <button
                        type="button"
                        onClick={() => update("attendeeEmails", form.attendeeEmails.filter((e) => e !== email))}
                        className="ml-2 shrink-0 text-xs text-soft hover:underline"
                      >
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

            <div className="mt-4 border-t border-card-border pt-3">
              <label className={LABEL_CLASS}>{labels.linkTo}</label>

              <div className="mt-2">
                {selectedContact ? (
                  <div className="flex items-center justify-between rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink">
                    <span className="truncate">{selectedContact.label}</span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, contactId: "", projectId: "", taskId: "", bookingId: "" }))}
                      className="ml-2 shrink-0 text-xs text-soft hover:underline"
                    >
                      {linkLabels.clear}
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder={linkLabels.searchPlaceholder}
                      className={FIELD_CLASS}
                    />
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

              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>{linkLabels.project}</label>
                  <select
                    value={form.projectId}
                    onChange={(e) => update("projectId", e.target.value)}
                    disabled={!form.contactId}
                    className={`${FIELD_CLASS} disabled:opacity-50`}
                  >
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
                  <select
                    value={form.taskId}
                    onChange={(e) => update("taskId", e.target.value)}
                    disabled={!form.projectId}
                    className={`${FIELD_CLASS} disabled:opacity-50`}
                  >
                    <option value="">{linkLabels.none}</option>
                    {availableTasks.map((tk) => (
                      <option key={tk.id} value={tk.id}>
                        {tk.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-2">
                <label className={LABEL_CLASS}>{linkLabels.booking}</label>
                <select
                  value={form.bookingId}
                  onChange={(e) => update("bookingId", e.target.value)}
                  disabled={!form.contactId}
                  className={`${FIELD_CLASS} disabled:opacity-50`}
                >
                  <option value="">{linkLabels.none}</option>
                  {availableBookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {detail?.htmlLink && (
              <a
                href={detail.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs font-semibold text-amo-lime hover:underline"
              >
                {labels.openInGoogleCalendar} ↗
              </a>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex items-center justify-between gap-3">
              {isEdit ? (
                <button type="button" disabled={pending} onClick={remove} className="text-sm text-red-600 hover:underline disabled:opacity-60">
                  {labels.delete}
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-3">
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
