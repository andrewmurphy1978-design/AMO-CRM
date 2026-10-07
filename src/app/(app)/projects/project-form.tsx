"use client";

import DateInput from "@/components/date-input";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import MultiSelect from "@/components/multi-select";
import PhaseList, { type PhaseRowData } from "./phase-list";
import PageHeader from "../page-header";
import CustomFieldsInputs from "./custom-fields-inputs";
import { projectTypeOptions, type TemplateConfig } from "@/lib/project-templates";
import ProjectTypesPicker from "@/components/project-types-picker";
import BrandFields from "@/components/brand-fields";
import SubscriptionEmailField from "@/components/subscription-email-field";

type ProjectFormValues = {
  id?: string;
  name?: string;
  contactId?: string;
  description?: string | null;
  status?: string;
  type?: string;
  types?: string[];
  createBrand?: boolean;
  brandItems?: string[];
  accountMode?: string | null;
  ownerId?: string | null;
  supervisorId?: string | null;
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
  location,
  templates,
  typeLabels,
  customTypeKeys = [],
}: {
  action: (
    prevState: { error?: string; success?: string; createdId?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string; createdId?: string }>;
  defaultValues?: ProjectFormValues;
  contacts: { id: string; label: string }[];
  users: { id: string; name: string }[];
  submitLabel: string;
  lang: Lang;
  title: string;
  hour12: boolean;
  location: string;
  // Custom fields per project type, asked for on create (new projects only).
  templates?: Record<string, TemplateConfig>;
  typeLabels: Record<string, string>;
  customTypeKeys?: string[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = getDict(lang);
  const router = useRouter();

  const [contactId, setContactId] = useState(defaultValues?.contactId ?? "");
  const [types, setTypes] = useState<string[]>(defaultValues?.types && defaultValues.types.length > 0 ? defaultValues.types : [defaultValues?.type ?? "WEBSITE"]);
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

  // A new project: go to its page with a normal navigation (see createProject).
  const createdId = state?.createdId;
  useEffect(() => {
    if (createdId) router.push(`/projects/${createdId}`);
  }, [createdId, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setDismissed(true);
      if (defaultValues?.id) router.push(`/projects/${defaultValues.id}`);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast, defaultValues?.id, router]);

  const STATUSES = [
    { value: "PROPOSAL", label: t.projectStatuses.PROPOSAL },
    { value: "PLANNING", label: t.projectStatuses.PLANNING },
    { value: "ACTIVE", label: t.projectStatuses.ACTIVE },
    { value: "FINAL", label: t.projectStatuses.FINAL },
    { value: "ON_HOLD", label: t.projectStatuses.ON_HOLD },
    { value: "COMPLETED", label: t.projectStatuses.COMPLETED },
    { value: "CANCELLED", label: t.projectStatuses.CANCELLED },
  ];

  const TYPES = projectTypeOptions(typeLabels, defaultValues?.type, customTypeKeys);

  return (
    <form action={formAction} className="space-y-6">
      <PageHeader
        title={title}
        hour12={hour12}
        lang={lang}
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
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
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
            defaultValue={defaultValues?.status ?? "PROPOSAL"}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{types.length > 1 ? (lang === "fr" ? "Types de projet (dans l'ordre)" : "Project types (in order)") : lang === "fr" ? "Type de projet" : "Project type"}</label>
          <div className="mt-1">
            <ProjectTypesPicker options={TYPES} initial={types} lang={lang} onChange={setTypes} />
          </div>
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
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.projectForm.supervisor}</label>
          <select
            name="supervisorId"
            defaultValue={defaultValues?.supervisorId ?? ""}
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


      <div className="grid gap-3 rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm sm:grid-cols-2">
          <BrandFields defaultChecked={defaultValues?.createBrand ?? true} defaultItems={defaultValues?.brandItems ?? []} lang={lang} />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{lang === "fr" ? "Comptes du client" : "Client accounts"}</label>
            <select name="accountMode" defaultValue={defaultValues?.accountMode ?? ""} className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30">
              <option value="">{lang === "fr" ? "— Non précisé —" : "— Not decided —"}</option>
              <option value="CLIENT">{lang === "fr" ? "Le client gère ses propres accès (ajoute une phase de formation)" : "Client controls their own credentials (adds a Training phase)"}</option>
              <option value="MANAGED">{lang === "fr" ? "Je gère un sous-compte (frais mensuels d'hébergement, mises à jour et soutien)" : "I manage a sub-account (monthly hosting, update & support fee)"}</option>
            </select>
            <div className="mt-3">
              <SubscriptionEmailField contactId={contactId} defaultValue={(defaultValues as { subscriptionEmail?: string | null } | undefined)?.subscriptionEmail ?? ""} lang={lang} />
            </div>
          </div>
        </div>

      {!defaultValues?.id &&
        types.map((ty) => {
          const fields = templates?.[ty]?.fields ?? [];
          if (fields.length === 0) return null;
          return (
            <div key={ty} className="space-y-3 rounded-xl border border-card-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-soft">{typeLabels[ty] ?? ty}</p>
              <p className="text-xs text-soft">
                {lang === "fr"
                  ? "Vos réponses créent automatiquement les phases et les tâches du projet."
                  : "Your answers automatically create the project's phases and tasks."}
              </p>
              <CustomFieldsInputs fields={fields} lang={lang} prefix={`${ty}__`} />
            </div>
          );
        })}

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
}: {
  label: string;
  name: string;
  defaultValue?: Date | string | null;
  lang?: Lang;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{label}</label>
      <DateInput
        name={name}
        defaultValue={toDateInput(defaultValue)}
        className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      />
    </div>
  );
}
