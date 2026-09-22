"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

export interface LinkOption {
  id: string;
  label: string;
  contactId?: string | null; // set on projects and bookings — which client they belong to
  projectId?: string | null; // set on tasks — which project they belong to
  email?: string | null; // set on contacts — for the Calendar event dialog's guest-from-contact search
}

export interface LinkDialogLabels {
  title: string;
  link: string; // trigger button text when nothing is linked yet
  edit: string; // trigger button text (appended after "Linked to X ·") once something is
  searchPlaceholder: string;
  noResults: string;
  contact: string;
  project: string;
  task: string;
  booking: string;
  affiliateProgram: string;
  none: string;
  save: string;
  saving: string;
  cancel: string;
  clear: string;
}

export interface LinkValues {
  contactId: string;
  projectId: string;
  taskId: string;
  bookingId: string;
  affiliateProgramId: string;
}

// Shared modal used by both the Email and Calendar pages to attach a
// message/appointment to a client (searchable, since there can be
// hundreds) and, once a client is picked, to a project of theirs, a task
// of that project, and (Calendar only) a booking of theirs — each select
// only ever shows options that actually belong to the level above it.
//
// State resets to `initial` on mount and never re-syncs afterwards — a
// caller that reuses one instance across multiple rows/events (like the
// Calendar's single shared dialog) must remount it on the target changing
// (e.g. `key={target?.id}`) rather than relying on this component to
// notice a prop change while already open.
export default function LinkDialog({
  open,
  onClose,
  contacts,
  projects,
  tasks,
  bookings,
  affiliatePrograms,
  initial,
  onSave,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  bookings?: LinkOption[]; // omitted entirely on the Email page
  affiliatePrograms?: LinkOption[]; // only passed on the Email page
  initial: LinkValues;
  onSave: (values: LinkValues) => Promise<void>;
  labels: LinkDialogLabels;
}) {
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState(initial.contactId);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [taskId, setTaskId] = useState(initial.taskId);
  const [bookingId, setBookingId] = useState(initial.bookingId);
  // Independent of the contact/project/task/booking hierarchy above — a
  // program isn't nested under a client, so it gets its own flat select
  // instead of a cascading one.
  const [affiliateProgramId, setAffiliateProgramId] = useState(initial.affiliateProgramId);
  const [pending, startTransition] = useTransition();

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? contacts.filter((c) => c.label.toLowerCase().includes(q)) : contacts;
    return list.slice(0, 20);
  }, [search, contacts]);

  const availableProjects = useMemo(
    () => (contactId ? projects.filter((p) => p.contactId === contactId) : []),
    [projects, contactId]
  );
  const availableTasks = useMemo(() => (projectId ? tasks.filter((t) => t.projectId === projectId) : []), [tasks, projectId]);
  const availableBookings = useMemo(
    () => (bookings && contactId ? bookings.filter((b) => b.contactId === contactId) : []),
    [bookings, contactId]
  );

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const selectedContact = contacts.find((c) => c.id === contactId) ?? null;

  function clearContact() {
    setContactId("");
    setProjectId("");
    setTaskId("");
    setBookingId("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-card-border bg-card-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-semibold text-ink">{labels.title}</h3>

        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{labels.contact}</label>
          {selectedContact ? (
            <div className="mt-1 flex items-center justify-between rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink">
              <span className="truncate">{selectedContact.label}</span>
              <button type="button" onClick={clearContact} className="ml-2 shrink-0 text-xs text-soft hover:underline">
                {labels.clear}
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={labels.searchPlaceholder}
                className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
              />
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-card-border">
                {filteredContacts.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-soft">{labels.noResults}</p>
                ) : (
                  filteredContacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setContactId(c.id);
                        setProjectId("");
                        setTaskId("");
                        setBookingId("");
                        setSearch("");
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

        <div className="mt-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{labels.project}</label>
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setTaskId("");
            }}
            disabled={!contactId}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm disabled:opacity-50"
          >
            <option value="">{labels.none}</option>
            {availableProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{labels.task}</label>
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            disabled={!projectId}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm disabled:opacity-50"
          >
            <option value="">{labels.none}</option>
            {availableTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {bookings && (
          <div className="mt-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{labels.booking}</label>
            <select
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              disabled={!contactId}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm disabled:opacity-50"
            >
              <option value="">{labels.none}</option>
              {availableBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {affiliatePrograms && (
          <div className="mt-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{labels.affiliateProgram}</label>
            <select
              value={affiliateProgramId}
              onChange={(e) => setAffiliateProgramId(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm"
            >
              <option value="">{labels.none}</option>
              {affiliatePrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-soft hover:underline">
            {labels.cancel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await onSave({ contactId, projectId, taskId, bookingId, affiliateProgramId });
                onClose();
              })
            }
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
          >
            {pending ? labels.saving : labels.save}
          </button>
        </div>
      </div>
    </div>
  );
}
