"use client";

import { useActionState, useRef, useEffect } from "react";
import { createProposal } from "@/actions/proposals";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FIELD_CLASS =
  "rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

export default function QuickAddProposal({ projectId, lang }: { projectId: string; lang: Lang }) {
  const [state, formAction, pending] = useActionState(createProposal, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const t = getDict(lang);

  useEffect(() => {
    if (!pending && !state?.error) {
      formRef.current?.reset();
    }
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="status" value="DRAFT" />
      <input
        name="title"
        required
        placeholder={t.proposals.titlePlaceholder}
        className={`${FIELD_CLASS} min-w-[10rem] flex-1`}
      />
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0"
        placeholder={t.proposals.amount}
        className={`${FIELD_CLASS} w-28`}
      />
      <select name="currency" defaultValue="CAD" className={FIELD_CLASS}>
        <option value="CAD">CAD</option>
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="btn-primary rounded-lg px-3 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {t.proposals.add}
      </button>
      {state?.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
