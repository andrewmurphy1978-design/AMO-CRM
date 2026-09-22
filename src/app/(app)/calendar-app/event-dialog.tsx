"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format, type Locale } from "date-fns";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { EVENT_COLOR_OPTIONS, GOOGLE_EVENT_COLORS, DEFAULT_EVENT_COLOR, eventColor } from "@/lib/calendar-colors";
import { formatClockTime } from "@/lib/calendar-time";
import { formatReminderMinutes, REMINDER_MINUTE_PRESETS, MAX_REMINDER_OVERRIDES, type ReminderLabels } from "@/lib/calendar-reminders";
import ColorSelect, { type ColorOption } from "@/components/color-select";
import RichTextarea from "@/components/rich-textarea";
import type { CalendarEventInput, CalendarEventDetail } from "@/lib/google";
import {
  fetchCalendarEventDetail,
  fetchDefaultReminders,
  createCalendarEventAction,
  updateCalendarEventAction,
  deleteCalendarEventAction,
  type EventLinkTargets,
} from "@/actions/calendar";
import type { LinkOption } from "../link-dialog";

export type EventDialogTarget = { id: string } | { start: Date };

type RepeatPreset = "none" | "daily" | "weekly" | "monthly" | "yearly";

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

// Current UTC offset of a zone, in minutes (e.g. -300 for America/New_York
// in winter) — used only to sort/label the picker, so a wrong or zero
// result on an environment without full Intl offset support just falls
// back to alphabetical order rather than crashing.
function tzOffsetMinutes(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
    const match = name.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!match) return 0;
    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = match[3] ? Number(match[3]) : 0;
    return sign * (hours * 60 + minutes);
  } catch {
    return 0;
  }
}

function tzOffsetLabel(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? "-" : "+";
  const abs = Math.abs(totalMinutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// Ordered UTC-12 -> UTC+14, the way Google Calendar's own timezone picker
// sorts (rather than the alphabetical order Intl.supportedValuesOf returns).
function listTimeZoneOptions(): { tz: string; label: string }[] {
  let zones: string[];
  try {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    zones = typeof supportedValuesOf === "function" ? supportedValuesOf("timeZone") : FALLBACK_TIME_ZONES;
  } catch {
    zones = FALLBACK_TIME_ZONES;
  }
  return zones
    .map((tz) => ({ tz, offset: tzOffsetMinutes(tz) }))
    .sort((a, b) => a.offset - b.offset)
    .map(({ tz, offset }) => ({ tz, label: `(${tzOffsetLabel(offset)}) ${tz}` }));
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
  reminderUseDefault: boolean;
  reminderOverrides: number[]; // minutes; only meaningful when reminderUseDefault is false
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
    reminderUseDefault: true,
    reminderOverrides: [],
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
    reminderUseDefault: detail.reminderUseDefault,
    reminderOverrides: detail.reminderOverrides,
    transparency: detail.transparency,
    visibility: detail.visibility,
    attendeeEmails: detail.attendees.map((a) => a.email).filter(Boolean),
    contactId: links.contactId,
    projectId: links.projectId,
    taskId: links.taskId,
    bookingId: links.bookingId,
  };
}

export interface EventDialogLabels extends ReminderLabels {
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
  addNotification: string;
  useDefaultReminder: string;
  removeReminder: string;
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
const COMPACT_FIELD_CLASS = "rounded-md border border-card-border bg-field-bg px-2.5 py-1.5 text-sm text-ink shadow-sm";

// Shows a long-form formatted date ("September 22, 2026" / "22 septembre
// 2026") while unfocused; swaps to a native date input (calendar-icon
// picker + typed entry) on focus, same pattern as the Project edit form's
// own DateField.
function DateDisplayField({
  value,
  onChange,
  lang,
  dateLocale,
}: {
  value: string;
  onChange: (value: string) => void;
  lang: Lang;
  dateLocale: Locale | undefined;
}) {
  const [focused, setFocused] = useState(false);
  const longFormat = lang === "fr" ? "d MMMM yyyy" : "MMMM d, yyyy";
  const displayValue = (() => {
    if (!value) return "";
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? value : format(d, longFormat, { locale: dateLocale });
  })();

  // Fixed width on both variants — a native <input type="date"> is
  // intrinsically narrower than the long formatted text it replaces on
  // focus, which without this made the field visibly shrink the moment
  // you clicked into it.
  return focused ? (
    <input
      type="date"
      autoFocus
      value={value}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value)}
      className={`${COMPACT_FIELD_CLASS} w-40`}
    />
  ) : (
    <input
      type="text"
      readOnly
      value={displayValue}
      onFocus={() => setFocused(true)}
      className={`${COMPACT_FIELD_CLASS} w-40 cursor-pointer`}
    />
  );
}

// Native <input type="time"> can't be forced into a fixed 12h/24h display —
// Chrome renders it per the browser/OS locale regardless of any HTML
// attribute, which is exactly why an earlier version of this field kept
// reverting to 12-hour even for 24h-setting users. This renders the time
// itself (always via formatClockTime, so it always matches the app's own
// setting), typable directly for an exact value, with a dropdown of
// 5-minute-interval presets for quick picking — the same combo-box pattern
// Google Calendar's own time field uses.
function timeDisplay(value: string, hour12: boolean, intlLocale: string): string {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  return formatClockTime(new Date(2000, 0, 1, h, m), hour12, intlLocale);
}

// Lenient parse of a typed time — accepts 12h ("9:00 am", "9am", "9 pm") and
// 24h ("21:00", "9:00") forms so manual entry works regardless of the
// viewer's own display setting. Returns null (and the field reverts to the
// last valid value) when it can't make sense of the input.
function parseTimeText(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, "");
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = meridiem === "am" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  }
  return `${pad(hour)}:${pad(minute)}`;
}

const MINUTE_STEPS = Array.from({ length: 12 }, (_, i) => i * 5); // 00, 05, ..., 55

// A column of clickable values inside the picker popup, auto-scrolled to
// the current selection when it opens — the "rolling column" feel of a
// native mobile time picker's hour/minute/AM-PM wheels, without depending
// on the browser's own (locale-tied, un-overridable) time input.
function PickerColumn({
  values,
  format,
  selected,
  onSelect,
  open,
}: {
  values: number[];
  format: (v: number) => string;
  selected: number;
  onSelect: (v: number) => void;
  open: boolean;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: "center" });
  }, [open]);

  return (
    <div className="max-h-48 w-14 overflow-y-auto border-r border-card-border last:border-r-0">
      {values.map((v) => (
        <button
          key={v}
          ref={v === selected ? selectedRef : undefined}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(v)}
          className={`block w-full px-2 py-1 text-center text-sm hover:bg-amo-lime/10 ${v === selected ? "bg-amo-lime/10 font-semibold text-ink" : "text-ink"}`}
        >
          {format(v)}
        </button>
      ))}
    </div>
  );
}

const HOUR_OPTIONS_24 = Array.from({ length: 24 }, (_, i) => i);
const HOUR_OPTIONS_12 = [12, ...Array.from({ length: 11 }, (_, i) => i + 1)]; // 12, 1, 2, ..., 11 — clock order

function TimeDisplayField({
  value,
  onChange,
  hour12,
  intlLocale,
}: {
  value: string;
  onChange: (value: string) => void;
  hour12: boolean;
  intlLocale: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => timeDisplay(value, hour12, intlLocale));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(timeDisplay(value, hour12, intlLocale));
  }, [value, hour12, intlLocale]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function commit(raw: string) {
    const parsed = parseTimeText(raw);
    if (parsed) {
      onChange(parsed);
      setText(timeDisplay(parsed, hour12, intlLocale));
    } else {
      setText(timeDisplay(value, hour12, intlLocale));
    }
  }

  const [hour24, minute] = value.split(":").map(Number);
  const safeHour = Number.isNaN(hour24) ? 0 : hour24;
  const safeMinute = Number.isNaN(minute) ? 0 : minute;
  const isPM = safeHour >= 12;
  const hour12Value = safeHour % 12 === 0 ? 12 : safeHour % 12;

  function apply(nextHour24: number, nextMinute: number) {
    const next = `${pad(nextHour24)}:${pad(nextMinute)}`;
    onChange(next);
    setText(timeDisplay(next, hour12, intlLocale));
  }

  function selectHour(h: number) {
    if (!hour12) {
      apply(h, safeMinute);
      return;
    }
    const next24 = isPM ? (h === 12 ? 12 : h + 12) : h === 12 ? 0 : h;
    apply(next24, safeMinute);
  }

  function selectMinute(m: number) {
    apply(safeHour, m);
  }

  function selectPeriod(period: "AM" | "PM") {
    if ((period === "PM") === isPM) return;
    apply(period === "PM" ? safeHour + 12 : safeHour - 12, safeMinute);
  }

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(text);
            setOpen(false);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`${COMPACT_FIELD_CLASS} w-20`}
      />
      {open && (
        <div className="absolute z-30 mt-1 flex overflow-hidden rounded-md border border-card-border bg-card-bg shadow-lg">
          <PickerColumn
            values={hour12 ? HOUR_OPTIONS_12 : HOUR_OPTIONS_24}
            format={pad}
            selected={hour12 ? hour12Value : safeHour}
            onSelect={selectHour}
            open={open}
          />
          <PickerColumn values={MINUTE_STEPS} format={pad} selected={safeMinute - (safeMinute % 5)} onSelect={selectMinute} open={open} />
          {hour12 && (
            <PickerColumn
              values={[0, 1]}
              format={(v) => (v === 0 ? "AM" : "PM")}
              selected={isPM ? 1 : 0}
              onSelect={(v) => selectPeriod(v === 0 ? "AM" : "PM")}
              open={open}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function EventDialog({
  target,
  initialLinks,
  onClose,
  onSaved,
  onDeleted,
  contacts,
  projects,
  tasks,
  bookings,
  lang,
  hour12,
  dateLocale,
  intlLocale,
  labels,
  linkLabels,
}: {
  target: EventDialogTarget | null;
  // Known CRM links for an existing event, from the calendar's own already-
  // fetched map — fetchCalendarEventDetail only talks to Google, which has
  // no idea about these, so without this the edit dialog would silently
  // wipe an event's existing contact/project/task/booking link on every save.
  initialLinks?: EventLinkTargets;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  bookings: LinkOption[];
  lang: Lang;
  hour12: boolean;
  dateLocale: Locale | undefined;
  intlLocale: string;
  labels: EventDialogLabels;
  linkLabels: { contact: string; project: string; task: string; booking: string; none: string; clear: string; searchPlaceholder: string; noResults: string };
}) {
  const t = getDict(lang);
  const isEdit = target !== null && "id" in target;
  const eventId = target && "id" in target ? target.id : null;

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalendarEventDetail | null>(null);
  const [defaultReminders, setDefaultReminders] = useState<number[]>([]);
  const [form, setForm] = useState<FormState>(() => (target && "start" in target ? blankState(target.start) : blankState(new Date())));
  const [contactSearch, setContactSearch] = useState("");
  const [contactFieldOpen, setContactFieldOpen] = useState(false);
  const contactFieldRef = useRef<HTMLDivElement>(null);
  const [guestInput, setGuestInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const timeZoneOptions = useMemo(() => listTimeZoneOptions(), []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contactFieldRef.current && !contactFieldRef.current.contains(e.target as Node)) setContactFieldOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    // Independent of create/edit — a brand new event still needs to show
    // what its "default notification" would actually mean.
    let cancelled = false;
    fetchDefaultReminders().then((result) => {
      if (!cancelled && !("error" in result)) setDefaultReminders(result.minutes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const filteredGuestContacts = useMemo(() => {
    const q = guestInput.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter((c) => c.email && c.label.toLowerCase().includes(q) && !form.attendeeEmails.includes(c.email)).slice(0, 8);
  }, [guestInput, contacts, form.attendeeEmails]);

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

  function addGuestEmail(email: string) {
    const trimmed = email.trim();
    if (!trimmed || form.attendeeEmails.includes(trimmed)) return;
    update("attendeeEmails", [...form.attendeeEmails, trimmed]);
    setGuestInput("");
  }

  // "Andrew Murphy (andrewmurphy1978@gmail.com)" when the address matches a
  // known contact, otherwise just the bare email.
  function guestLabel(email: string): string {
    const match = contacts.find((c) => c.email && c.email.toLowerCase() === email.toLowerCase());
    return match ? `${match.label} (${email})` : email;
  }

  // Mirrors Google Calendar's own behavior: adding a custom notification
  // while still on the calendar's defaults converts to an explicit list
  // seeded with those same defaults (the API can't represent "default plus
  // one more" — reminders.useDefault and .overrides are mutually
  // exclusive), so the visible list doesn't change, only how it's stored.
  function addReminder() {
    setForm((f) => {
      if (f.reminderUseDefault) {
        const seeded = [...defaultReminders, 30].slice(0, MAX_REMINDER_OVERRIDES);
        return { ...f, reminderUseDefault: false, reminderOverrides: seeded };
      }
      if (f.reminderOverrides.length >= MAX_REMINDER_OVERRIDES) return f;
      return { ...f, reminderOverrides: [...f.reminderOverrides, 30] };
    });
  }

  // Removing one of the calendar's own default reminders means "keep the
  // other defaults, minus this one" — since Google's API only knows
  // useDefault-or-overrides (never a subset of the defaults), that has to
  // become an explicit override list seeded with whatever's left.
  function removeDefaultReminderAt(index: number) {
    update("reminderUseDefault", false);
    update("reminderOverrides", defaultReminders.filter((_, i) => i !== index));
  }

  function updateReminderAt(index: number, minutes: number) {
    update(
      "reminderOverrides",
      form.reminderOverrides.map((m, i) => (i === index ? minutes : m))
    );
  }

  function removeReminderAt(index: number) {
    update(
      "reminderOverrides",
      form.reminderOverrides.filter((_, i) => i !== index)
    );
  }

  function buildInput(): CalendarEventInput {
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
      reminderUseDefault: form.reminderUseDefault,
      reminderOverrides: form.reminderOverrides,
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
  const color = eventColor(form.colorId || null);
  // GOOGLE_EVENT_COLORS only ever pairs a bg with "#fff" or "#000" text —
  // branching on that (rather than hardcoding white) is what keeps the
  // header's own buttons/links readable against every event color,
  // Banana's black-on-yellow included.
  const headerIsDark = color.fg === "#000";
  const headerBtnClass = headerIsDark ? "border-black/30 hover:bg-black/10" : "border-white/40 hover:bg-white/15";
  const headerLinkClass = headerIsDark ? "opacity-80 hover:opacity-100" : "opacity-90 hover:opacity-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pulled out of the scrollable body below (not just `sticky`), so
            it never moves as the form scrolls — same fix already applied
            to the top color bar this replaces, just spread into a full
            colored heading instead of a thin strip. */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4" style={{ backgroundColor: color.bg, color: color.fg }}>
          <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{isEdit ? labels.editTitle : labels.createTitle}</h3>
          {!loading && !loadError && (
            <div className="flex shrink-0 items-center gap-3">
              {detail?.htmlLink && (
                <a href={detail.htmlLink} target="_blank" rel="noopener noreferrer" className={`text-xs font-semibold underline ${headerLinkClass}`}>
                  {labels.openInGoogleCalendar} ↗
                </a>
              )}
              {isEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={remove}
                  className={`rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60 ${headerBtnClass}`}
                >
                  {labels.delete}
                </button>
              )}
              <button type="button" onClick={onClose} className={`text-sm hover:underline ${headerLinkClass}`}>
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
        <div className="min-h-0 flex-1 overflow-y-auto p-5">

        {loading ? (
          <p className="mt-4 text-sm text-soft">{labels.loading}</p>
        ) : loadError ? (
          <p className="mt-4 text-sm text-red-600">{loadError === "not_connected" ? labels.notConnected : labels.loadFailed}</p>
        ) : (
          <div className="mt-4 space-y-4">
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder={labels.titlePlaceholder}
              className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-base font-medium text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />

            {/* Full-width, above the two-column split below — start/end
                date+time, all-day, timezone, and repeat all get the whole
                dialog's width to spread out in, rather than being squeezed
                into a 2/3 column beside the Link-to section. Start and End
                sit on the same row as two grouped pairs (each date glued to
                its own time via its own flex group) so on a narrow screen
                a wrap breaks between Start and End rather than separating
                either one's date from its own time. */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-10 shrink-0 text-xs font-semibold uppercase tracking-wide text-soft">{labels.start}</span>
                  <DateDisplayField value={form.startDate} onChange={(v) => update("startDate", v)} lang={lang} dateLocale={dateLocale} />
                  {!form.allDay && <TimeDisplayField value={form.startTime} onChange={(v) => update("startTime", v)} hour12={hour12} intlLocale={intlLocale} />}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-10 shrink-0 text-xs font-semibold uppercase tracking-wide text-soft">{labels.end}</span>
                  <DateDisplayField value={form.endDate} onChange={(v) => update("endDate", v)} lang={lang} dateLocale={dateLocale} />
                  {!form.allDay && <TimeDisplayField value={form.endTime} onChange={(v) => update("endTime", v)} hour12={hour12} intlLocale={intlLocale} />}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={form.allDay} onChange={(e) => toggleAllDay(e.target.checked)} className="h-4 w-4 rounded border-card-border" />
                  {labels.allDay}
                </label>

                {!form.allDay && (
                  <select value={form.timeZone} onChange={(e) => update("timeZone", e.target.value)} className="rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-xs text-ink shadow-sm">
                    {!timeZoneOptions.some((o) => o.tz === form.timeZone) && <option value={form.timeZone}>{form.timeZone}</option>}
                    {timeZoneOptions.map((o) => (
                      <option key={o.tz} value={o.tz}>
                        {o.label}
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
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="min-w-0 space-y-4">
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={LABEL_CLASS}>{labels.color}</label>
                  <ColorSelect options={colorOptions} value={form.colorId} onChange={(v) => update("colorId", v)} className="mt-1" />
                </div>
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

              {/* Notifications — Google Calendar allows either the
                  calendar's own defaults, or up to 5 custom overrides, but
                  never both at once; addReminder() below seeds the custom
                  list from the current defaults so switching away from
                  "default" doesn't visibly change anything. */}
              <div>
                <label className={LABEL_CLASS}>{labels.reminder}</label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {form.reminderUseDefault ? (
                    defaultReminders.length > 0 ? (
                      defaultReminders.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink">
                          <span>{formatReminderMinutes(m, labels)}</span>
                          <button type="button" onClick={() => removeDefaultReminderAt(i)} aria-label={labels.removeReminder} className="shrink-0 text-xs text-soft hover:underline">
                            {labels.removeReminder}
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink">{labels.reminderDefault}</div>
                    )
                  ) : (
                    <>
                      {form.reminderOverrides.map((minutes, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <select value={minutes} onChange={(e) => updateReminderAt(i, Number(e.target.value))} className={COMPACT_FIELD_CLASS}>
                            {REMINDER_MINUTE_PRESETS.map((m) => (
                              <option key={m} value={m}>
                                {formatReminderMinutes(m, labels)}
                              </option>
                            ))}
                          </select>
                          <button type="button" onClick={() => removeReminderAt(i)} aria-label={labels.removeReminder} className="text-soft hover:text-red-600">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                              <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      {form.reminderOverrides.length === 0 && (
                        <button type="button" onClick={() => update("reminderUseDefault", true)} className="text-xs text-soft hover:underline">
                          {labels.useDefaultReminder}
                        </button>
                      )}
                    </>
                  )}
                  {(form.reminderUseDefault || form.reminderOverrides.length < MAX_REMINDER_OVERRIDES) && (
                    <button type="button" onClick={addReminder} className="text-xs font-semibold text-amo-lime hover:underline">
                      + {labels.addNotification}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>{labels.guests}</label>
                {form.attendeeEmails.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {form.attendeeEmails.map((email) => (
                      <li key={email} className="flex items-center justify-between rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink">
                        <span className="truncate">{guestLabel(email)}</span>
                        <button type="button" onClick={() => update("attendeeEmails", form.attendeeEmails.filter((e) => e !== email))} className="ml-2 shrink-0 text-xs text-soft hover:underline">
                          {t.contactForm.removeEntry}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="relative mt-1">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={guestInput}
                      onChange={(e) => setGuestInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addGuestEmail(guestInput);
                        }
                      }}
                      placeholder={labels.guestEmailPlaceholder}
                      className="flex-1 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
                    />
                    <button type="button" onClick={() => addGuestEmail(guestInput)} className="rounded-md border border-card-border px-3 py-2 text-xs font-medium text-ink hover:bg-black/5">
                      {labels.addGuest}
                    </button>
                  </div>
                  {filteredGuestContacts.length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-32 w-full overflow-y-auto rounded-md border border-card-border bg-card-bg shadow-lg">
                      {filteredGuestContacts.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => addGuestEmail(c.email!)}
                          className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-amo-lime/10"
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>{labels.description}</label>
                <RichTextarea value={form.description} onChange={(html) => update("description", html)} className="mt-1" />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="min-w-0 space-y-3 border-t border-card-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <label className={LABEL_CLASS}>{labels.linkTo}</label>

              <div ref={contactFieldRef}>
                {selectedContact ? (
                  <div className="flex items-center justify-between rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink">
                    <span className="truncate">{selectedContact.label}</span>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, contactId: "", projectId: "", taskId: "", bookingId: "" }))} className="ml-2 shrink-0 text-xs text-soft hover:underline">
                      {linkLabels.clear}
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={contactSearch}
                      onFocus={() => setContactFieldOpen(true)}
                      onChange={(e) => {
                        setContactSearch(e.target.value);
                        setContactFieldOpen(true);
                      }}
                      placeholder={linkLabels.searchPlaceholder}
                      className={FIELD_CLASS}
                    />
                    {contactFieldOpen && (
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
                                setContactFieldOpen(false);
                              }}
                              className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-amo-lime/10"
                            >
                              {c.label}
                            </button>
                          ))
                        )}
                      </div>
                    )}
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
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
