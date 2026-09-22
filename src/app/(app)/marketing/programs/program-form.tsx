"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
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

// The icon field's only input is the circle itself — click it to open the
// browser's native file picker, then the chosen image is cropped to a
// square and downscaled client-side (canvas) before being stored as a data
// URI in the same hidden field a plain text URL would have used. That
// keeps the stored value small and avoids standing up separate file/blob
// storage just for a handful of small program logos.
const ICON_MAX_DIM = 128;

function IconUploadField({ name, defaultValue, label }: { name: string; defaultValue?: string | null; label: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = ICON_MAX_DIM;
        canvas.height = ICON_MAX_DIM;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.max(ICON_MAX_DIM / img.width, ICON_MAX_DIM / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (ICON_MAX_DIM - w) / 2, (ICON_MAX_DIM - h) / 2, w, h);
        setValue(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title={label}
        aria-label={label}
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-card-border bg-field-bg text-soft hover:border-amo-gold hover:text-amo-gold"
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 7.5A1.5 1.5 0 0 1 5.5 6H7l1-1.5h8L17 6h1.5A1.5 1.5 0 0 1 20 7.5v9A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5v-9Z"
            />
            <circle cx="12" cy="12" r="3.25" />
          </svg>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
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
    startTransition(async () => {
      const result = await revealAffiliateProgramApiKey(programId!);
      if (result.error) setMessage(result.error);
      else setRevealed(result.value ?? "");
    });
  }

  function handleCopy() {
    if (revealed == null) return;
    navigator.clipboard
      .writeText(revealed)
      .then(() => setMessage(t.marketing.apiKeyCopiedMessage))
      .catch(() => setMessage(t.marketing.apiKeyEnterFirst));
  }

  // One link slot to the right of the field that cycles through whichever
  // action makes sense right now: typing a new value always offers Save
  // (so rotating an already-saved key doesn't need a separate mode); once
  // saved with nothing being typed it offers Reveal; once revealed it
  // switches to Copy instead of re-fetching the plaintext value again.
  const linkAction: { label: string; onClick: () => void } | null = value.trim()
    ? { label: pending ? t.common.saving : t.marketing.apiKeySaveLabel, onClick: handleSave }
    : revealed !== null
      ? { label: t.marketing.apiKeyCopyLabel, onClick: handleCopy }
      : saved
        ? { label: pending ? t.common.saving : t.apiVault.reveal, onClick: handleReveal }
        : null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setRevealed(null);
          }}
          placeholder={saved ? t.marketing.apiKeySavedPlaceholder : t.marketing.apiKeyLabel}
          className={`${FIELD_CLASS} flex-1`}
        />
        {linkAction && (
          <button
            type="button"
            onClick={linkAction.onClick}
            disabled={pending}
            className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-60"
          >
            {linkAction.label}
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
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-2">
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
            <IconUploadField name="iconUrl" defaultValue={defaultValues?.iconUrl} label={t.marketing.iconUrlLabel} />
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
            <div>
              <label htmlFor="followUpNeeded" className={LABEL_CLASS}>
                {t.marketing.colFollowUp}
              </label>
              <div className="mt-1 flex h-[38px] items-center">
                <input
                  type="checkbox"
                  id="followUpNeeded"
                  name="followUpNeeded"
                  defaultChecked={defaultValues?.followUpNeeded ?? false}
                  className="h-4 w-4 rounded border-card-border accent-amo-lime"
                />
              </div>
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
