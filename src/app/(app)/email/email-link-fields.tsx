"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { saveEmailLink } from "@/actions/links";
import type { LinkOption, LinkDialogLabels, LinkValues } from "../link-dialog";

export interface EmailLinkConfig {
  threadId: string;
  subject: string;
  fromLabel: string;
  date: string;
  link: string;
  myAddress: string | null;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  programs: LinkOption[];
  initial: LinkValues;
  current: { name: string; href: string } | null;
  labels: LinkDialogLabels;
  onSaved: (values: LinkValues) => void;
}

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

// The Email/Compose dialogs' "Linked to" section — same contact/project/
// task/program fields as Calendar's own inline link section
// (calendar-app/event-dialog.tsx), laid out inline instead of behind
// LinkDialog's modal. Split into two independent pieces (rather than one
// component toggling itself) because the summary always stays put next to
// the message metadata while the editor, once opened, renders in a
// completely different spot — beside the message body — so the caller
// owns the open/closed state and decides where each piece goes.

// The always-visible line ("Linked to: X" + an edit affordance) — stays
// wherever the caller puts it (top of the dialog, beside the metadata)
// regardless of whether the editor is currently open elsewhere.
export function EmailLinkSummary({
  current,
  linkLabel,
  noneLabel,
  editLabel,
  onEdit,
}: {
  current: { name: string; href: string } | null;
  linkLabel: string;
  noneLabel: string;
  editLabel: string;
  onEdit: () => void;
}) {
  return (
    <div>
      <p className={LABEL_CLASS}>{linkLabel}</p>
      <div className="mt-1 flex items-center gap-2">
        {current ? (
          <Link href={current.href} className="min-w-0 truncate text-sm font-medium text-emerald-700 hover:underline">
            {current.name}
          </Link>
        ) : (
          <span className="truncate text-sm text-soft">{noneLabel}</span>
        )}
        <button type="button" onClick={onEdit} title={editLabel} className="shrink-0 rounded p-1 text-soft hover:bg-black/10 hover:text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <circle cx="8" cy="16" r="4" />
            <circle cx="16" cy="8" r="4" />
            <path strokeLinecap="round" d="M10.8 13.2 13.2 10.8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// The actual editing fields, rendered only while open — positioned by the
// caller (beside the email body), with its own Save/Cancel since these
// dialogs have no single whole-form save button to piggyback on.
export function EmailLinkEditor({ config, onDone }: { config: EmailLinkConfig; onDone: () => void }) {
  const { labels } = config;
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState(config.initial.contactId);
  const [projectId, setProjectId] = useState(config.initial.projectId);
  const [taskId, setTaskId] = useState(config.initial.taskId);
  const [programId, setProgramId] = useState(config.initial.affiliateProgramId);
  const [pending, startTransition] = useTransition();

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? config.contacts.filter((c) => c.label.toLowerCase().includes(q)) : config.contacts;
    return list.slice(0, 20);
  }, [search, config.contacts]);
  const availableProjects = useMemo(
    () => (contactId ? config.projects.filter((p) => p.contactId === contactId) : []),
    [config.projects, contactId]
  );
  const availableTasks = useMemo(() => (projectId ? config.tasks.filter((t) => t.projectId === projectId) : []), [config.tasks, projectId]);
  const selectedContact = config.contacts.find((c) => c.id === contactId) ?? null;

  function clearContact() {
    setContactId("");
    setProjectId("");
    setTaskId("");
  }

  function save() {
    startTransition(async () => {
      const values: LinkValues = { contactId, projectId, taskId, bookingId: "", affiliateProgramId: programId };
      await saveEmailLink(
        config.threadId,
        { contactId: values.contactId, projectId: values.projectId, taskId: values.taskId, affiliateProgramId: values.affiliateProgramId },
        { subject: config.subject, fromLabel: config.fromLabel, date: config.date, link: config.link, myAddress: config.myAddress }
      );
      config.onSaved(values);
      onDone();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={LABEL_CLASS}>{labels.contact}</label>
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
              className={FIELD_CLASS}
            />
            <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-card-border">
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

      <div>
        <label className={LABEL_CLASS}>{labels.project}</label>
        <select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setTaskId("");
          }}
          disabled={!contactId}
          className={`${FIELD_CLASS} disabled:opacity-50`}
        >
          <option value="">{labels.none}</option>
          {availableProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL_CLASS}>{labels.task}</label>
        <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!projectId} className={`${FIELD_CLASS} disabled:opacity-50`}>
          <option value="">{labels.none}</option>
          {availableTasks.map((tk) => (
            <option key={tk.id} value={tk.id}>
              {tk.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL_CLASS}>{labels.affiliateProgram}</label>
        <select value={programId} onChange={(e) => setProgramId(e.target.value)} className={FIELD_CLASS}>
          <option value="">{labels.none}</option>
          {config.programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <button type="button" onClick={onDone} className="text-sm text-soft hover:underline">
          {labels.cancel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>
      </div>
    </div>
  );
}
