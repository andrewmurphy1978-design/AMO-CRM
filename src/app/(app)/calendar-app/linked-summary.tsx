"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export interface LinkedSummaryValues {
  contactId: string;
  projectId: string;
  taskId: string;
}

export interface LinkedSummaryLabels {
  linkedToPrefix: string;
  project: string;
  task: string;
}

// Renders "Linked to: X / Project: Y / Task: Z" inside an event box — each
// name is its own link (contact -> contact detail, project -> project
// detail, task -> its edit page), booking is deliberately never shown here
// (it's sync-derived, not something to navigate to from the calendar). The
// "/" is just a visual separator between whichever of the three are set.
// Callers rely on the parent box's own overflow-hidden to clip this line
// when there isn't room for it — no truncation logic needed here beyond a
// single-line `truncate`.
export default function LinkedSummaryLine({
  values,
  contactById,
  projectById,
  taskById,
  labels,
  className,
}: {
  values: LinkedSummaryValues | undefined;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  labels: LinkedSummaryLabels;
  className?: string;
}) {
  if (!values) return null;
  const contactName = values.contactId ? contactById[values.contactId] : null;
  const projectName = values.projectId ? projectById[values.projectId] : null;
  const taskName = values.taskId ? taskById[values.taskId] : null;
  if (!contactName && !projectName && !taskName) return null;

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  const parts: ReactNode[] = [];
  if (contactName) {
    parts.push(
      <span key="contact">
        {labels.linkedToPrefix}{" "}
        <Link href={`/contacts/${values.contactId}`} onClick={stop} className="underline hover:opacity-80">
          {contactName}
        </Link>
      </span>
    );
  }
  if (projectName) {
    parts.push(
      <span key="project">
        {labels.project}:{" "}
        <Link href={`/projects/${values.projectId}`} onClick={stop} className="underline hover:opacity-80">
          {projectName}
        </Link>
      </span>
    );
  }
  if (taskName) {
    parts.push(
      <span key="task">
        {labels.task}:{" "}
        <Link href={`/projects/${values.projectId}/tasks/${values.taskId}/edit`} onClick={stop} className="underline hover:opacity-80">
          {taskName}
        </Link>
      </span>
    );
  }

  return (
    <div className={className}>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1 opacity-60">/</span>}
          {part}
        </span>
      ))}
    </div>
  );
}
