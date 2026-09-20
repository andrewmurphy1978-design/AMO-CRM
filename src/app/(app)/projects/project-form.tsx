"use client";

import { useActionState, useRef, useState } from "react";
import { format } from "date-fns";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import MultiSelect from "@/components/multi-select";

type ProjectFormValues = {
  name?: string;
  contactId?: string;
  description?: string | null;
  status?: string;
  type?: string;
  ownerId?: string | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  teamMembers?: { userId: string }[];
  phases?: { id: string; name: string }[];
};

export default function ProjectForm({
  action,
  defaultValues,
  contacts,
  users,
  submitLabel,
  lang,
}: {
  action: (prevState: { error?: string } | undefined, formData: FormData) => Promise<{ error?: string }>;
  defaultValues?: ProjectFormValues;
  contacts: { id: string; label: string }[];
  users: { id: string; name: string }[];
  submitLabel: string;
  lang: Lang;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = getDict(lang);

  const [teamMemberIds, setTeamMemberIds] = useState<string[]>(
    () => defaultValues?.teamMembers?.map((tm) => tm.userId) ?? []
  );

  const [phases, setPhases] = useState(() =>
    (defaultValues?.phases ?? []).map((p, tempKey) => ({ tempKey, id: p.id, name: p.name }))
  );
  const nextTempKey = useRef(phases.length);

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
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.projectName}</label>
        <input
          name="name"
          required
          defaultValue={defaultValues?.name}
          className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
          <div className="mt-1">
            <MultiSelect
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              selected={teamMemberIds}
              placeholder={t.projectForm.selectTeamMembers}
              onChange={setTeamMemberIds}
            />
          </div>
        </div>
        <DateField label={t.projectForm.startDate} name="startDate" defaultValue={defaultValues?.startDate} lang={lang} />
        <DateField label={t.projectForm.dueDate} name="dueDate" defaultValue={defaultValues?.dueDate} lang={lang} />
      </div>

      {defaultValues?.phases !== undefined && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.phasesTitle}</label>
          <div className="mt-1 space-y-1.5">
            {phases.map((phase) => (
              <div key={phase.tempKey} className="flex items-center gap-1.5">
                <input type="hidden" name="phaseId" value={phase.id} />
                <input
                  type="text"
                  name="phaseName"
                  defaultValue={phase.name}
                  className="flex-1 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
                />
                <button
                  type="button"
                  onClick={() => setPhases((rows) => rows.filter((r) => r.tempKey !== phase.tempKey))}
                  className="rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
                  aria-label={t.contactForm.removeEntry}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPhases((rows) => [...rows, { tempKey: nextTempKey.current++, id: "", name: "" }])}
              className="text-xs font-semibold text-amo-lime hover:underline"
            >
              + {t.projectForm.addPhase}
            </button>
          </div>
        </div>
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

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.common.saving : submitLabel}
      </button>
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
      <input
        type="text"
        value={focused ? value : displayValue}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => setValue(e.target.value)}
        placeholder={focused ? "yyyy-mm-dd" : undefined}
        className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
