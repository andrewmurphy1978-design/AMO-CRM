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
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-emerald-700 hover:underline"
      >
        {summary ? `${summary} · ${labels.edit}` : labels.link}
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
