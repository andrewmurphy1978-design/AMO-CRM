"use client";

import { useState } from "react";
import { saveEmailLink } from "@/actions/links";
import LinkDialog, { type LinkOption, type LinkDialogLabels, type LinkValues } from "../link-dialog";

export type { LinkOption };

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
  onSaved,
}: {
  threadId: string;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  initialContactId: string;
  initialProjectId: string;
  initialTaskId: string;
  summary: string | null;
  labels: LinkDialogLabels;
  onSaved?: (values: LinkValues) => void;
}) {
  const [open, setOpen] = useState(false);

  const initial: LinkValues = {
    contactId: initialContactId,
    projectId: initialProjectId,
    taskId: initialTaskId,
    bookingId: "",
  };

  async function handleSave(values: LinkValues) {
    await saveEmailLink(threadId, { contactId: values.contactId, projectId: values.projectId, taskId: values.taskId });
    onSaved?.(values);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={summary ? `${summary} · ${labels.edit}` : labels.link}
        className={`shrink-0 rounded p-1 hover:bg-black/10 ${summary ? "text-emerald-700" : "text-soft"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
      </button>
      <LinkDialog
        open={open}
        onClose={() => setOpen(false)}
        contacts={contacts}
        projects={projects}
        tasks={tasks}
        initial={initial}
        onSave={handleSave}
        labels={labels}
      />
    </>
  );
}
