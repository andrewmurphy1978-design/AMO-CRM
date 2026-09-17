"use client";

import Link from "next/link";

export interface LinkedSummaryValues {
  contactId: string;
  projectId: string;
  taskId: string;
}

// Stacks whichever of contact/project/task are linked, one name per line,
// each its own link (contact -> contact detail, project -> project detail,
// task -> its edit page) — no "Linked to:"/"Project:"/"Task:" labels, just
// the plain names. Booking is deliberately never shown here (it's
// sync-derived, not something to navigate to from the calendar). Callers
// rely on the parent box's own overflow-hidden to clip this when there
// isn't room for it.
export default function LinkedSummaryLine({
  values,
  contactById,
  projectById,
  taskById,
  className,
}: {
  values: LinkedSummaryValues | undefined;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
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

  return (
    <div className={className}>
      {contactName && (
        <div className="truncate">
          <Link href={`/contacts/${values.contactId}`} onClick={stop} className="underline hover:opacity-80">
            {contactName}
          </Link>
        </div>
      )}
      {projectName && (
        <div className="truncate">
          <Link href={`/projects/${values.projectId}`} onClick={stop} className="underline hover:opacity-80">
            {projectName}
          </Link>
        </div>
      )}
      {taskName && (
        <div className="truncate">
          <Link href={`/projects/${values.projectId}/tasks/${values.taskId}/edit`} onClick={stop} className="underline hover:opacity-80">
            {taskName}
          </Link>
        </div>
      )}
    </div>
  );
}
