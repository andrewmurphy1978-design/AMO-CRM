"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { saveAffiliateProgramApiKey, revealAffiliateProgramApiKey } from "@/actions/affiliate-programs";
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
  iconUrl?: string | null;
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
    <div>
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

// On the New Program form (no programId yet) this is just a plain field
// submitted with the rest of the form. On the Edit form it gets its own
// Save button — encrypted and stored the moment it's entered instead of
// only on the next full "Save changes" — plus a Reveal button to check
// the currently saved value.
function ApiKeyField({
  programId,
  hasApiKeySaved,
  t,
}: {
  programId?: string;
  hasApiKeySaved?: boolean;
  t: ReturnType<typeof getDict>;
}) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(hasApiKeySaved ?? false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!programId) {
    return (
      <input
        type="password"
        name="apiKey"
        placeholder={hasApiKeySaved ? t.marketing.apiKeySavedPlaceholder : t.marketing.apiKeyLabel}
        className={FIELD_CLASS}
      />
    );
  }

  function handleSave() {
    if (!value.trim()) {
      setMessage(t.marketing.apiKeyEnterFirst);
      return;
    }
    startTransition(async () => {
      const result = await saveAffiliateProgramApiKey(programId!, value);
      setMessage(result.error ?? result.success ?? null);
      if (!result.error) {
        setSaved(true);
        setValue("");
      }
    });
  }

  function handleReveal() {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    startTransition(async () => {
      const result = await revealAffiliateProgramApiKey(programId!);
      if (result.error) setMessage(result.error);
      else setRevealed(result.value ?? "");
    });
  }

  return (
    <div>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={saved ? t.marketing.apiKeySavedPlaceholder : t.marketing.apiKeyLabel}
        className={FIELD_CLASS}
      />
      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-60"
        >
          {pending ? t.common.saving : t.marketing.apiKeySaveLabel}
        </button>
        {saved && (
          <button
            type="button"
            onClick={handleReveal}
            disabled={pending}
            className="text-xs font-medium text-soft hover:underline disabled:opacity-60"
          >
            {revealed !== null ? t.apiVault.hide : t.apiVault.reveal}
          </button>
        )}
      </div>
      {revealed !== null && <code className="mt-1 block break-all rounded bg-field-bg px-2 py-1 text-xs text-ink">{revealed}</code>}
      {message && <p className="mt-1 text-xs text-soft">{message}</p>}
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
  programId,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  defaultValues?: AffiliateProgramFormValues;
  defaultTab?: string;
  hasApiKeySaved?: boolean;
  submitLabel: string;
  title: string;
  lang: Lang;
  hour12: boolean;
  dateLocale: Parameters<typeof PageHeader>[0]["dateLocale"];
  location: string;
  // Only set on the Edit form — on a successful save, the toast redirects
  // to this program's own info page once it's done showing. The New
  // Program form has no id yet (createAffiliateProgram redirects
  // server-side instead, straight to the freshly created program).
  programId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [tab, setTab] = useState(defaultValues?.tab ?? defaultTab ?? "AI_TOOLS");
  const t = getDict(lang);
  const router = useRouter();

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
      if (programId) router.push(`/marketing/programs/${programId}`);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast, programId, router]);

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
      {toast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>
        </div>
      )}

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Row 1: Program, Type, Category */}
          <div>
            <label className={LABEL_CLASS}>{t.marketing.colProgram}</label>
            <input name="name" required defaultValue={defaultValues?.name ?? ""} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.marketing.colType}</label>
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
          <div>
            <label className={LABEL_CLASS}>{t.marketing.iconUrlLabel}</label>
            <input type="url" name="iconUrl" defaultValue={defaultValues?.iconUrl ?? ""} className={FIELD_CLASS} />
            <div className="mt-2 flex items-center gap-2">
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
          </div>

          {/* Row 4: French links + Follow-up needed / Follow-up date — all
              three cells push their content to the bottom so the input
              boxes line up across the row despite the third cell having
              extra content (the checkbox line) above its date field. */}
          <div className="flex flex-col justify-end">
            <label className={LABEL_CLASS}>{t.marketing.frenchSlugLabel}</label>
            <input name="frenchSlug" defaultValue={defaultValues?.frenchSlug ?? ""} className={FIELD_CLASS} />
          </div>
          <div className="flex flex-col justify-end">
            <label className={LABEL_CLASS}>{t.marketing.frenchLinkLabel}</label>
            <input type="url" name="frenchLink" defaultValue={defaultValues?.frenchLink ?? ""} className={FIELD_CLASS} />
          </div>
          <div className="flex flex-col justify-end">
            <div className="flex items-center gap-2">
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

          {/* Row 5: Where to apply, App Platform, has-own-API + API key —
              same bottom-alignment treatment as row 4. */}
          <div className="flex flex-col justify-end">
            <label className={LABEL_CLASS}>{t.marketing.applyUrlLabel}</label>
            <input type="url" name="applyUrl" defaultValue={defaultValues?.applyUrl ?? ""} className={FIELD_CLASS} />
          </div>
          <div className="flex flex-col justify-end">
            <label className={LABEL_CLASS}>{t.marketing.applyPlatformLabel}</label>
            <input list="platformOptions" name="applyPlatform" defaultValue={defaultValues?.applyPlatform ?? ""} className={FIELD_CLASS} />
            <datalist id="platformOptions">
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col justify-end">
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
            <ApiKeyField programId={programId} hasApiKeySaved={hasApiKeySaved} t={t} />
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
