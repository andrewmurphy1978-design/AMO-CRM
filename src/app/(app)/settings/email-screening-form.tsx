"use client";

import { useActionState } from "react";
import { saveEmailScreeningInstructions } from "@/actions/users";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export default function EmailScreeningForm({ initialInstructions, lang }: { initialInstructions: string; lang: Lang }) {
  const [state, action, pending] = useActionState(saveEmailScreeningInstructions, undefined);
  const t = getDict(lang);

  return (
    <form action={action} className="space-y-3">
      <textarea
        name="instructions"
        defaultValue={initialInstructions}
        placeholder={t.emailScreeningSettings.placeholder}
        rows={4}
        className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
      >
        {pending ? t.emailScreeningSettings.saving : t.emailScreeningSettings.save}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}
