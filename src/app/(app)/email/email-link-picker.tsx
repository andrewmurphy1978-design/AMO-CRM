"use client";

import { useState } from "react";
import { saveEmailLink } from "@/actions/links";
import LinkDialog, { type LinkOption, type LinkDialogLabels, type LinkValues } from "../link-dialog";

export type { LinkOption };

export default function EmailLinkPicker({
  threadId,
  subject,
  fromLabel,
  date,
  link,
  myAddress,
  contacts,
  projects,
  tasks,
  programs,
  initialContactId,
  initialProjectId,
  initialTaskId,
  initialProgramId,
  summary,
  labels,
  onSaved,
}: {
  threadId: string;
  subject: string;
  fromLabel: string;
  date: string;
  link: string;
  myAddress?: string | null;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  programs: LinkOption[];
  initialContactId: string;
  initialProjectId: string;
  initialTaskId: string;
  initialProgramId: string;
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
    affiliateProgramId: initialProgramId,
  };

  async function handleSave(values: LinkValues) {
    await saveEmailLink(
      threadId,
      { contactId: values.contactId, projectId: values.projectId, taskId: values.taskId, affiliateProgramId: values.affiliateProgramId },
      { subject, fromLabel, date, link, myAddress }
    );
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
        {/* A clearer two-ring chain glyph — the previous icon read as a
            paperclip at small sizes, which now clashes with the actual
            attachment paperclip icon on each row. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <circle cx="8" cy="16" r="4" />
          <circle cx="16" cy="8" r="4" />
          <path strokeLinecap="round" d="M10.8 13.2 13.2 10.8" />
        </svg>
      </button>
      <LinkDialog
        open={open}
        onClose={() => setOpen(false)}
        contacts={contacts}
        projects={projects}
        tasks={tasks}
        affiliatePrograms={programs}
        initial={initial}
        onSave={handleSave}
        labels={labels}
      />
    </>
  );
}
