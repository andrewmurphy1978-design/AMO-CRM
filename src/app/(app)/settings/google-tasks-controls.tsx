"use client";

import { useActionState } from "react";
import { googleTasksAction } from "@/actions/google-tasks";

const BUTTON_CLASS = "rounded-md border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60";

// Settings > Google integration: turn the two-way Google Tasks sync on/off
// and run it by hand. Tasks assigned to you appear in a "AMO CRM" list in the
// Google Tasks app on your phone; ticking one off there ticks it off here.
export default function GoogleTasksControls({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(googleTasksAction, undefined);

  return (
    <div className="mt-4 space-y-2 border-t border-card-border pt-4">
      <p className="text-sm text-ink">
        <span className="font-semibold">Google Tasks:</span>{" "}
        {enabled ? <span className="font-medium text-emerald-700">On</span> : <span className="text-soft">Off</span>}
      </p>
      <p className="text-xs text-soft">
        Tasks assigned to you show up in a list called &ldquo;AMO CRM&rdquo; in Google Tasks (and the Google Tasks and Calendar apps on your phone). Title, notes, due date and done/not
        done stay in step both ways, checked every 15 minutes and whenever you change a task here. Google only keeps a due date (no time), and a task added in Google is not
        brought into the CRM, because every CRM task belongs to a project.
      </p>
      <form action={action} className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <button name="intent" value="sync" disabled={pending} className={BUTTON_CLASS}>
              {pending ? "Syncing..." : "Sync now"}
            </button>
            <button name="intent" value="disable" disabled={pending} className="rounded-md px-3 py-1.5 text-sm text-soft hover:text-red-600 hover:underline disabled:opacity-60">
              Turn off
            </button>
          </>
        ) : (
          <button name="intent" value="enable" disabled={pending} className={BUTTON_CLASS}>
            {pending ? "Turning on..." : "Turn on Google Tasks sync"}
          </button>
        )}
      </form>
      {state?.error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-700">{state.success}</p>}
    </div>
  );
}
