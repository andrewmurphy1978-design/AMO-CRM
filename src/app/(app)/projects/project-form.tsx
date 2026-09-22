"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { Locale } from "date-fns";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import MultiSelect from "@/components/multi-select";
import PhaseList, { type PhaseRowData } from "./phase-list";
import PageHeader from "../page-header";

type ProjectFormValues = {
  id?: string;
  name?: string;
  contactId?: string;
  description?: string | null;
  status?: string;
  type?: string;
  ownerId?: string | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  teamMembers?: { userId: string }[];
  phases?: PhaseRowData[];
};

export default function ProjectForm({
  action,
  defaultValues,
  contacts,
  users,
  submitLabel,
  lang,
  title,
  hour12,
  dateLocale,
  location,
}: {
  action: (
    prevState: { error?: string; success?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string }>;
  defaultValues?: ProjectFormValues;
  contacts: { id: string; label: string }[];
  users: { id: string; name: string }[];
  submitLabel: string;
  lang: Lang;
  title: string;
  hour12: boolean;
  dateLocale: Locale | undefined;
  location: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = getDict(lang);
  const router = useRouter();

  const [teamMemberIds, setTeamMemberIds] = useState<string[]>(
    () => defaultValues?.teamMembers?.map((tm) => tm.userId) ?? []
  );
  const teamNames = users.filter((u) => teamMemberIds.includes(u.id)).map((u) => u.name);

  // Same success-toast-then-redirect pattern as Contact/Affiliate Program
  // edit — the action returns {success} without redirecting itself so the
  // toast has something to show before this component sends the user on.
  const [dismissed, setDismissed] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<string | undefined>(undefined);
  if (state?.success !== lastSuccess) {
    setLastSuccess(state?.success);
    setDismissed(false);
  }
  const toast = state?.success && !dismissed ? state.success : null;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setDismissed(true);
      if (defaultValues?.id) router.push(`/projects/${defaultValues.id}`);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast, defaultValues?.id, router]);

  const STATUSES = [
    { value: "PLANNING", label: t.projectStatuses.PLANNING },
    { value: "ACTIVE", label: t.projectStatuses.ACTIVE },
    { value: "ON_HOLD", label: t.projectStatuses.ON_HOLD },
    { value: "COMPLETED", label: t.projectStatuses.COMPLETED },
    { value: "CANCELLED", label: t.projectStatuses.CANCELLED },
  ];

  const TYPES = [
    { value: "WEBSITE", label: t.projectTypes.WEBSITE },
    { value: "FUNNEL", label: t.projectTypes.FUNNEL },
    { value: "APP", label: t.projectTypes.APP },
    { value: "SOCIAL_MEDIA", label: t.projectTypes.SOCIAL_MEDIA },
    { value: "CONSULTING", label: t.projectTypes.CONSULTING },
    { value: "OTHER", label: t.projectTypes.OTHER },
  ];

  return (
    <form action={formAction} className="space-y-6">
      <PageHeader
        title={title}
        hour12={hour12}
        dateLocale={dateLocale}
        location={location}
        actions={
          <button
            type="submit"
            disabled={pending}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
          >
            {pending ? t.common.saving : submitLabel}
          </button>
        }
      />

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {toast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.projectName}</label>
        <input
          name="name"
          required
          defaultValue={defaultValues?.name}
          className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.client}</label>
          <select
            name="contactId"
            required
            defaultValue={defaultValues?.contactId ?? ""}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          >
            <option value="" disabled>
              {t.projectForm.selectClient}
            </option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.status}</label>
          <select
            name="status"
            defaultValue={defaultValues?.status ?? "PLANNING"}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.type}</label>
          <select
            name="type"
            defaultValue={defaultValues?.type ?? "OTHER"}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          >
            {TYPES.map((ty) => (
              <option key={ty.value} value={ty.value}>
                {ty.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.owner}</label>
          <select
            name="ownerId"
            defaultValue={defaultValues?.ownerId ?? ""}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          >
            <option value="">{t.common.unassigned}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.teamMembers}</label>
          {teamMemberIds.map((id) => (
            <input key={id} type="hidden" name="teamMemberIds" value={id} />
          ))}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <MultiSelect
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              selected={teamMemberIds}
              placeholder={t.projectForm.selectTeamMembers}
              onChange={setTeamMemberIds}
            />
            {teamNames.length > 0 && <span className="text-sm text-ink">{teamNames.join(", ")}</span>}
          </div>
        </div>
        <DateField label={t.projectForm.startDate} name="startDate" defaultValue={defaultValues?.startDate} lang={lang} />
        <DateField label={t.projectForm.dueDate} name="dueDate" defaultValue={defaultValues?.dueDate} lang={lang} />
      </div>

      {defaultValues?.id && defaultValues?.phases !== undefined && (
        <PhaseList
          projectId={defaultValues.id}
          initialPhases={defaultValues.phases}
          users={users}
          defaultTeamMemberIds={teamMemberIds}
          lang={lang}
        />
      )}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.description}</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ""}
          className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </div>
      </div>
    </form>
  );
}

function toDateInput(value?: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

// Shows "September 26, 2026" (or "26 septembre, 2026" in French) while
// unfocused; switches to a plain yyyy-mm-dd text field for editing once
// focused, and back on blur. The visible input is never itself submitted —
// a hidden input alongside it always carries the canonical yyyy-mm-dd
// value, so the submitted date never depends on the locale-formatted
// display string being parseable.
function DateField({
  label,
  name,
  defaultValue,
  lang,
}: {
  label: string;
  name: string;
  defaultValue?: Date | string | null;
  lang: Lang;
}) {
  const [value, setValue] = useState(() => toDateInput(defaultValue));
  const [focused, setFocused] = useState(false);
  const dateLocale = getDateLocale(lang);

  const longFormat = lang === "fr" ? "d MMMM, yyyy" : "MMMM d, yyyy";
  const displayValue = (() => {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return format(date, longFormat, { locale: dateLocale });
  })();

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{label}</label>
      {focused ? (
        // Native date input while editing — gives a calendar-icon picker
        // as well as typed manual entry, without building either one from
        // scratch. Swaps back to the plain formatted-text display on blur.
        <input
          type="date"
          autoFocus
          value={value}
          onBlur={() => setFocused(false)}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      ) : (
        <input
          type="text"
          value={displayValue}
          onFocus={() => setFocused(true)}
          readOnly
          className="mt-1 w-full cursor-pointer rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      )}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
