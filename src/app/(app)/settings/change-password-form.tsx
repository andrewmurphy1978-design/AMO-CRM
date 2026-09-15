"use client";

import { useActionState } from "react";
import { changePassword } from "@/actions/users";

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, undefined);

  return (
    <form action={formAction} className="grid gap-3 sm:max-w-sm">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
          Current password
        </label>
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
          New password
        </label>
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
          Confirm new password
        </label>
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="justify-self-start btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
