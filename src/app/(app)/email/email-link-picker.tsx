"use client";

import { useState, useTransition } from "react";
import { saveEmailLink } from "@/actions/links";

export interface LinkOption {
  id: string;
  label: string;
}

export interface EmailLinkLabels {
  link: string;
  edit: string;
  none: string;
  contact: string;
  project: string;
  task: string;
  save: string;
  saving: string;
  cancel: string;
}

export default function EmailLinkPicker({
  threadId,
  contacts,
  projects,
  tasks,
  initialContactId,
  initialProjectId,
  initialTaskId,
  summary,
  labels,
}: {
  threadId: string;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  initialContactId: string;
  initialProjectId: string;
  initialTaskId: string;
  summary: string | null;
  labels: EmailLinkLabels;
}) {
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState(initialContactId);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [taskId, setTaskId] = useState(initialTaskId);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-emerald-700 hover:underline"
      >
        {summary ? `${summary} · ${labels.edit}` : labels.link}
      </button>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <select
        value={contactId}
        onChange={(e) => setContactId(e.target.value)}
        className="rounded-md border border-card-border bg-field-bg px-2 py-1 text-xs text-ink"
      >
        <option value="">
          {labels.contact}: {labels.none}
        </option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="rounded-md border border-card-border bg-field-bg px-2 py-1 text-xs text-ink"
      >
        <option value="">
          {labels.project}: {labels.none}
        </option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <select
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
        className="rounded-md border border-card-border bg-field-bg px-2 py-1 text-xs text-ink"
      >
        <option value="">
          {labels.task}: {labels.none}
        </option>
        {tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await saveEmailLink(threadId, { contactId, projectId, taskId });
            setOpen(false);
          })
        }
        className="btn-primary rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-60"
      >
        {pending ? labels.saving : labels.save}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-soft hover:underline">
        {labels.cancel}
      </button>
    </div>
  );
}
