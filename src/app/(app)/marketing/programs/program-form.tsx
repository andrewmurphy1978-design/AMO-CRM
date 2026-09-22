"use client";

import { useActionState, useState } from "react";
import { format } from "date-fns";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "../../page-header";
import { AFFILIATE_STATUS_VALUES, AFFILIATE_TYPE_OPTIONS } from "@/lib/affiliate-status";

const PLATFORM_OPTIONS = ["PartnerStack", "Impact", "Direct", "Other"];

function toDateInputValue(value?: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

type AffiliateProgramFormValues = {
  tab?: string;
  name?: string;
  type?: string | null;
  shortioCreated?: boolean;
  brandedLink?: string | null;
  destinationLink?: string | null;
  affiliateStatus?: string | null;
  statusDetails?: string | null;
  frenchSlug?: string | null;
  frenchLink?: string | null;
  followUpNeeded?: boolean;
  notes?: string | null;
  accountPlan?: string | null;
  applyUrl?: string | null;
  applyPlatform?: string | null;
  followUpDate?: Date | string | null;
  hasApi?: boolean;
};

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

// Shows a locale-formatted long date ("September 26, 2026") while unfocused;
// switches to a plain yyyy-mm-dd text field for editing once focused, and
// back on blur — same pattern as the Project edit form's date fields. A
// hidden input alongside the visible one always carries the canonical
// yyyy-mm-dd value, so what actually gets submitted never depends on the
// locale-formatted display string being parseable.
function DateField({ label, name, defaultValue, lang }: { label: string; name: string; defaultValue?: Date | string | null; lang: Lang }) {
  const [value, setValue] = useState(() => toDateInputValue(defaultValue));
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
    <div className="flex-1">
      <label className={LABEL_CLASS}>{label}</label>
      <input
        type="text"
        value={focused ? value : displayValue}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => setValue(e.target.value)}
        placeholder={focused ? "yyyy-mm-dd" : undefined}
        className={FIELD_CLASS}
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export default function AffiliateProgramForm({
  action,
  defaultValues,
  defaultTab,
  hasApiKeySaved,
  submitLabel,
  title,
  lang,
  hour12,
  dateLocale,
  location,
}: {
  action: (prevState: { error?: string } | undefined, formData: FormData) => Promise<{ error?: string }>;
  defaultValues?: AffiliateProgramFormValues;
  defaultTab?: string;
  hasApiKeySaved?: boolean;
  submitLabel: string;
  title: string;
  lang: Lang;
  hour12: boolean;
  dateLocale: Parameters<typeof PageHeader>[0]["dateLocale"];
  location: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [tab, setTab] = useState(defaultValues?.tab ?? defaultTab ?? "AI_TOOLS");
  const t = getDict(lang);

  const TABS = [
    { value: "AI_TOOLS", label: t.marketing.aiToolsTitle },
    { value: "TRAINING_PROGRAMS", label: t.marketing.trainingProgramsTitle },
    { value: "BUSINESS_OPPORTUNITIES", label: t.marketing.businessOpportunitiesTitle },
  ];
  const typeOptions = AFFILIATE_TYPE_OPTIONS[tab] ?? [];

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

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Row 1: Program, Affiliate Programs, Category */}
          <div>
            <label className={LABEL_CLASS}>{t.marketing.colProgram}</label>
            <input name="name" required defaultValue={defaultValues?.name ?? ""} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.marketing.affiliateProgramsTitle}</label>
            <select name="tab" value={tab} onChange={(e) => setTab(e.target.value)} className={FIELD_CLASS}>
              {TABS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.marketing.categoryLabel}</label>
            <select name="type" defaultValue={defaultValues?.type ?? ""} className={FIELD_CLASS}>
              <option value="">—</option>
              {typeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Row 2: Status, Status Details, Account / Plan */}
          <div>
            <label className={LABEL_CLASS}>{t.marketing.colStatus}</label>
            <select name="affiliateStatus" defaultValue={defaultValues?.affiliateStatus ?? ""} className={FIELD_CLASS}>
              <option value="">—</option>
              {AFFILIATE_STATUS_VALUES.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.marketing.statusDetailsLabel}</label>
            <input name="statusDetails" defaultValue={defaultValues?.statusDetails ?? ""} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.marketing.accountPlanLabel}</label>
            <input name="accountPlan" defaultValue={defaultValues?.accountPlan ?? ""} className={FIELD_CLASS} />
          </div>

          {/* Row 3: English links + Short.io link created */}
          <div>
            <label className={LABEL_CLASS}>{t.marketing.brandedLinkLabel}</label>
            <input type="url" name="brandedLink" defaultValue={defaultValues?.brandedLink ?? ""} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.marketing.destinationLinkLabel}</label>
            <input type="url" name="destinationLink" defaultValue={defaultValues?.destinationLink ?? ""} className={FIELD_CLASS} />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              id="shortioCreated"
              name="shortioCreated"
              defaultChecked={defaultValues?.shortioCreated ?? false}
              className="h-4 w-4 rounded border-card-border accent-amo-lime"
            />
            <label htmlFor="shortioCreated" className="text-sm text-ink">
              {t.marketing.shortioCreatedLabel}
            </label>
          </div>

          {/* Row 4: French links + Follow-up needed / Follow-up date */}
          <div>
            <label className={LABEL_CLASS}>{t.marketing.frenchSlugLabel}</label>
            <input name="frenchSlug" defaultValue={defaultValues?.frenchSlug ?? ""} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.marketing.frenchLinkLabel}</label>
            <input type="url" name="frenchLink" defaultValue={defaultValues?.frenchLink ?? ""} className={FIELD_CLASS} />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                id="followUpNeeded"
                name="followUpNeeded"
                defaultChecked={defaultValues?.followUpNeeded ?? false}
                className="h-4 w-4 rounded border-card-border accent-amo-lime"
              />
              <label htmlFor="followUpNeeded" className="text-sm text-ink">
                {t.marketing.colFollowUp}
              </label>
            </div>
            <DateField label={t.marketing.followUpDateLabel} name="followUpDate" defaultValue={defaultValues?.followUpDate} lang={lang} />
          </div>

          {/* Row 5: Where to apply, App Platform, has-own-API + API key */}
          <div>
            <label className={LABEL_CLASS}>{t.marketing.applyUrlLabel}</label>
            <input type="url" name="applyUrl" defaultValue={defaultValues?.applyUrl ?? ""} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.marketing.applyPlatformLabel}</label>
            <input list="platformOptions" name="applyPlatform" defaultValue={defaultValues?.applyPlatform ?? ""} className={FIELD_CLASS} />
            <datalist id="platformOptions">
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hasApi"
                name="hasApi"
                defaultChecked={defaultValues?.hasApi ?? false}
                className="h-4 w-4 rounded border-card-border accent-amo-lime"
              />
              <label htmlFor="hasApi" className="text-sm text-ink">
                {t.marketing.hasApiLabel}
              </label>
            </div>
            <input
              type="password"
              name="apiKey"
              placeholder={hasApiKeySaved ? t.marketing.apiKeySavedPlaceholder : t.marketing.apiKeyLabel}
              className={FIELD_CLASS}
            />
          </div>

          {/* Notes */}
          <div className="lg:col-span-3">
            <label className={LABEL_CLASS}>{t.marketing.notesLabel}</label>
            <textarea name="notes" rows={4} defaultValue={defaultValues?.notes ?? ""} className={FIELD_CLASS} />
          </div>
        </div>
      </section>
    </form>
  );
}
