"use client";

import { useActionState } from "react";
import { changePassword } from "@/actions/users";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function ChangePasswordForm({ lang }: { lang: Lang }) {
  const [state, formAction, pending] = useActionState(changePassword, undefined);
  const t = getDict(lang);

  return (
    <form action={formAction} className="grid gap-3 sm:max-w-sm">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
          {t.changePasswordForm.currentPassword}
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
          {t.changePasswordForm.newPassword}
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
          {t.changePasswordForm.confirmPassword}
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
        {pending ? t.changePasswordForm.updating : t.changePasswordForm.update}
      </button>
    </form>
  );
}
