"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { COUNTRIES } from "@/lib/countries";
import { countryToCode } from "@/lib/country-flag";
import { regionOptionsForCountry, normalizeRegionForCountry } from "@/lib/regions";
import { groupTagsByCategory, tagPillStyle, type TagLike } from "@/lib/tag-colors";
import { normalizeFieldSlug, SERVICES_REQUIRED_DEFAULT_SLUG, PROJECT_GOAL_DEFAULT_SLUG } from "@/lib/custom-field-slugs";
import { COMPANY_TYPES } from "@/lib/company-types";
import { stateLabelForCountry, zipLabelForCountry } from "@/lib/address-labels";
import { INDUSTRIES } from "@/lib/industries";
import { CURRENCIES, PAYMENT_TERMS, PAYMENT_SCHEDULES } from "@/lib/currencies";
import PhoneField from "@/components/phone-field";
import PlatformIcon from "@/components/platform-icon";
import { MESSAGING_APPS, VOIP_APPS } from "@/lib/platform-icons";
import { getWorldTimeZoneOptions } from "@/lib/timezones";
import PageHeader from "../page-header";
import Card from "@/components/section-card";
import LocalTimeCard from "@/components/local-time-card";
import ContactCredentialsCard, { type ContactCredentialRow } from "./[id]/contact-credentials-card";
import { CONTACT_SYNC_APPS, type ContactSyncDirection } from "@/lib/contact-sync";

export type ExtraAddress = {
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
};
export type AppHandleRow = { app: string; handle: string };
type FieldValueRow = { fieldSlug: string; value: string | null };
export type DomainRow = {
  domain: string;
  registrar?: string | null;
  dnsProvider?: string | null;
  expiryDate?: Date | string | null;
  autoRenew?: boolean;
  managedBy?: string | null;
  notes?: string | null;
};
export type ContactRelationRow = {
  relatedContactId: string;
  relationType: string;
  notes?: string | null;
};
type AppSyncSettingRow = { app: string; enabled: boolean; direction: string };
export type RelatableContact = { id: string; firstName: string | null; lastName: string | null; company: string | null; email: string | null };

type ContactFormValues = {
  email?: string | null;
  email2?: string | null;
  extraEmails?: string[] | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  phone2?: string | null;
  extraPhones?: string[] | null;
  company?: string | null;
  nickname?: string | null;
  jobTitle?: string | null;
  birthday?: string | null;
  avatarUrl?: string | null;
  companyType?: string | null;
  jurisdictionCountry?: string | null;
  jurisdictionRegion?: string | null;
  industry?: string | null;
  locale?: string | null;
  timeZone?: string | null;
  website?: string | null;
  stage?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  extraAddresses?: ExtraAddress[] | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingZip?: string | null;
  billingCountry?: string | null;
  billingContactName?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  autoSendInvoiceReminders?: boolean;
  preferredCurrency?: string | null;
  paymentTerms?: string | null;
  paymentSchedule?: string | null;
  defaultDiscount?: number | null;
  websiteDomain?: string | null;
  websiteHostingProvider?: string | null;
  websiteDesignApp?: string | null;
  funnelsDomain?: string | null;
  funnelsHostingProvider?: string | null;
  funnelsDesignApp?: string | null;
  emailDomain?: string | null;
  emailHostingProvider?: string | null;
  emailMarketingApp?: string | null;
  storeDomain?: string | null;
  storeHostingProvider?: string | null;
  storeDesignApp?: string | null;
  techStackItems?: { label: string; domain?: string | null; hostingProvider?: string | null; app?: string | null }[] | null;
  socialLinks?: { platform: string; url: string }[] | null;
  messagingAccounts?: AppHandleRow[] | null;
  voipAccounts?: AppHandleRow[] | null;
  domains?: DomainRow[] | null;
  relationsFrom?: ContactRelationRow[] | null;
  appSyncSettings?: AppSyncSettingRow[] | null;
  notes?: string | null;
  source?: string | null;
  systemeIoId?: number | null;
  systemeIoRegisteredAt?: Date | string | null;
  lastSyncedAt?: Date | string | null;
  createdAt?: Date | string | null;
  fieldValues?: FieldValueRow[] | null;
};

export const SOCIAL_PLATFORMS = ["Facebook", "Instagram", "LinkedIn", "TikTok", "YouTube", "X", "Website", "Other"];

// Free-text suggestions for the Related Contacts "relation type" field —
// not an enum, since the actual range of family/business relations any
// client might have is open-ended (same reasoning as companyType/industry).
export const RELATION_TYPE_OPTIONS = ["Spouse", "Child", "Parent", "Sibling", "Business partner", "Employee", "Employer", "Referral", "Other"];

export const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
export const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

// One accent color per card — same "solid header bar" approach as the
// Email page's category sections, so each group of fields is visually
// distinct at a glance instead of the whole page being one long list.
export default function ContactForm({
  action,
  defaultValues,
  submitLabel,
  lang,
  allTags,
  currentTags,
  title,
  hour12,
  location,
  contactId,
  allContacts,
  isAdmin,
  credentialEntries,
}: {
  action: (
    prevState: { error?: string; success?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string }>;
  defaultValues?: ContactFormValues;
  submitLabel: string;
  lang: Lang;
  allTags: ({ id: string } & TagLike)[];
  currentTags?: string[];
  title: ReactNode;
  hour12: boolean;
  location: string;
  // Only set on the Edit form — on a successful save, the toast redirects
  // to this contact's own info page once it's done showing. The New
  // Contact form has no id yet (createContact redirects server-side
  // instead, straight to the freshly created contact).
  contactId?: string;
  // Every other contact, for the Related Contacts picker — omitted (empty)
  // on the New Contact form since there's no id yet to link from.
  allContacts?: RelatableContact[];
  // Gates the Credentials card below — same admin-only rule as the global
  // API key vault in Settings.
  isAdmin?: boolean;
  credentialEntries?: ContactCredentialRow[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = getDict(lang);
  // Resolved here (client-side) from `lang` rather than taken as a raw
  // date-fns Locale prop — a Locale carries function values, which can't
  // cross the Server->Client boundary when this is rendered from a Server
  // Component page.
  const dateLocale = getDateLocale(lang);
  const router = useRouter();

  // Resets `dismissed` the moment a new success message arrives, without an
  // effect — comparing against the last-seen message during render (React's
  // recommended way to "adjust state when a prop changes") instead of
  // calling setState synchronously inside a useEffect body.
  const [dismissed, setDismissed] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<string | undefined>(undefined);
  // A successful save means there's nothing left unsaved, whether the user
  // typed anything since mounting or not.
  const [dirty, setDirty] = useState(false);
  if (state?.success !== lastSuccess) {
    setLastSuccess(state?.success);
    setDismissed(false);
    if (state?.success) setDirty(false);
  }
  const toast = state?.success && !dismissed ? state.success : null;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setDismissed(true);
      if (contactId) router.push(`/contacts/${contactId}`);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast, contactId, router]);

  // Warn on a full page unload (tab close, refresh, typed URL) while there
  // are unsaved edits — the browser's own native dialog, not customizable.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Warn on in-app navigation (sidebar, breadcrumbs, any link anywhere in
  // the document) while there are unsaved edits, with a custom Discard/
  // Cancel choice instead of the browser's native dialog. A capturing
  // listener on the document fires before Next's own Link click handler,
  // so stopping propagation here keeps it from navigating.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [dirty]);

  const [selectedTags, setSelectedTags] = useState<string[]>(currentTags ?? []);
  const [timeZone, setTimeZone] = useState(defaultValues?.timeZone ?? "");
  // Tracked separately from the contact's own mailing address country — a
  // company can be incorporated somewhere other than where its owner does
  // business — so the jurisdiction region's label can react to it.
  const [jurisdictionCountry, setJurisdictionCountry] = useState(defaultValues?.jurisdictionCountry ?? "");
  // Same dropdown-vs-free-text behavior as the address State/Province field.
  const jurisdictionRegionOptions = regionOptionsForCountry(jurisdictionCountry);
  const normalizedJurisdictionRegion = normalizeRegionForCountry(jurisdictionCountry, defaultValues?.jurisdictionRegion ?? "");

  // Every world timezone, sorted west to east — computed once (deterministic
  // given a fixed reference date, so no server/client hydration mismatch).
  const [timeZoneOptions] = useState(() => getWorldTimeZoneOptions());

  // Three groups, matching the Contacts list page's own ordering/coloring:
  // language tags, then the CRM-only "personal" tags (Settings-managed, own
  // order), then everything from systeme.io — a divider is drawn between
  // each non-empty pair, same as the single language/everything-else
  // divider this used to be.
  const { language: languageTagList, personal: personalTagList, systemeIo: systemeIoTagList } = groupTagsByCategory(allTags);
  const sortedTags = [...languageTagList, ...personalTagList, ...systemeIoTagList];

  // Extra phones/emails beyond the first two — each row keeps a stable id
  // (independent of array position) so removing one from the middle doesn't
  // remount the ones after it and lose their in-progress edits.
  const [extraEmails, setExtraEmails] = useState(() =>
    (defaultValues?.extraEmails ?? []).map((value, id) => ({ id, value }))
  );
  const nextEmailId = useRef(extraEmails.length);
  const [extraPhones, setExtraPhones] = useState(() =>
    (defaultValues?.extraPhones ?? []).map((value, id) => ({ id, value }))
  );
  const nextPhoneId = useRef(extraPhones.length);

  const [socialLinks, setSocialLinks] = useState(() =>
    (defaultValues?.socialLinks ?? []).map((link, id) => ({ id, ...link }))
  );
  const nextSocialId = useRef(socialLinks.length);

  const [extraAddresses, setExtraAddresses] = useState(() =>
    (defaultValues?.extraAddresses ?? []).map((addr, id) => ({ id, ...addr }))
  );
  const nextAddressId = useRef(extraAddresses.length);

  const [messagingAccounts, setMessagingAccounts] = useState(() =>
    (defaultValues?.messagingAccounts ?? []).map((row, id) => ({ id, ...row }))
  );
  const nextMessagingId = useRef(messagingAccounts.length);

  const [voipAccounts, setVoipAccounts] = useState(() =>
    (defaultValues?.voipAccounts ?? []).map((row, id) => ({ id, ...row }))
  );
  const nextVoipId = useRef(voipAccounts.length);

  const [techStackItems, setTechStackItems] = useState(() =>
    (defaultValues?.techStackItems ?? []).map((row, id) => ({ id, ...row }))
  );
  const nextTechStackId = useRef(techStackItems.length);

  const [domains, setDomains] = useState(() =>
    (defaultValues?.domains ?? []).map((row, id) => ({
      id,
      ...row,
      // RSC serialization hands a DateTime prop to the client as a real
      // Date instance (not an ISO string), so String(date) here would give
      // Date.prototype.toString()'s "Tue Dec 01 2026 ..." format — sliced
      // to something a <input type="date"> silently rejects. toISOString()
      // is what actually produces the yyyy-mm-dd it needs.
      expiryDate: row.expiryDate ? (row.expiryDate instanceof Date ? row.expiryDate.toISOString() : String(row.expiryDate)).slice(0, 10) : "",
    }))
  );
  const nextDomainId = useRef(domains.length);

  const [relations, setRelations] = useState(() =>
    (defaultValues?.relationsFrom ?? []).map((row, id) => ({ id, ...row }))
  );
  const nextRelationId = useRef(relations.length);

  const appSyncDefaults = (app: string): { enabled: boolean; direction: ContactSyncDirection } => {
    const existing = defaultValues?.appSyncSettings?.find((row) => row.app === app);
    if (existing) return { enabled: existing.enabled, direction: existing.direction as ContactSyncDirection };
    // No saved setting yet — preserve today's behavior: a contact already
    // linked to google_contacts/systeme.io keeps getting pushed to on every
    // save, and a brand-new contact defaults to being sent to Google
    // Contacts only (per the explicit ask), not systeme.io.
    if (app === "google_contacts") return { enabled: true, direction: "BOTH" };
    if (app === "systeme_io") return { enabled: Boolean(defaultValues?.systemeIoId), direction: "BOTH" };
    return { enabled: false, direction: "BOTH" };
  };
  const [appSync, setAppSync] = useState<Record<string, { enabled: boolean; direction: ContactSyncDirection }>>(() =>
    Object.fromEntries(CONTACT_SYNC_APPS.map((def) => [def.app, appSyncDefaults(def.app)]))
  );

  // Only seeds the phone fields' initial flag — each PhoneField's flag is
  // independently changeable afterward regardless of the address country.
  const phoneCountry = countryToCode(defaultValues?.country) ?? "CA";
  const billingPhoneCountry = countryToCode(defaultValues?.billingCountry) ?? "CA";

  const STAGES = [
    { value: "LEAD", label: t.stages.LEAD },
    { value: "PROSPECT", label: t.stages.PROSPECT },
    { value: "CLIENT", label: t.stages.CLIENT },
    { value: "PAST_CLIENT", label: t.stages.PAST_CLIENT },
    { value: "UNSUBSCRIBED", label: t.stages.UNSUBSCRIBED },
    { value: "PERSONAL", label: t.stages.PERSONAL },
  ];

  // A contact with no systeme.io id was never synced — created directly in
  // the CRM — so its Source is ours to edit; a synced contact's Source
  // stays whatever systeme.io reported, read-only.
  const isManual = !defaultValues?.systemeIoId;
  const registeredAt = defaultValues?.systemeIoRegisteredAt ?? (isManual ? defaultValues?.createdAt : null);

  const findFieldValue = (normalized: string) =>
    defaultValues?.fieldValues?.find((fv) => normalizeFieldSlug(fv.fieldSlug) === normalized);
  const servicesRequired = findFieldValue("servicesrequired");
  const projectGoal = findFieldValue("projectgoaldescription");

  return (
    <>
    <form
      action={formAction}
      onChange={() => setDirty(true)}
      onClickCapture={(e) => {
        // Every "+ Add"/"✕ remove" row button below is a plain
        // type="button" click, not a native form "change" event, so it
        // needs its own dirty signal — this single capture-phase listener
        // covers all of them (emails/phones/addresses/tech stack/social/
        // messaging/VoIP rows) without threading a callback through each
        // one's own component.
        if ((e.target as HTMLElement).closest('button[type="button"]')) setDirty(true);
      }}
      className="space-y-6"
    >
      {pendingHref && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-card-bg p-6 shadow-xl">
            <p className="font-display text-base font-semibold text-ink">{t.contactForm.unsavedChangesTitle}</p>
            <p className="mt-2 text-sm text-soft">{t.contactForm.unsavedChangesBody}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingHref(null)}
                className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  const href = pendingHref;
                  setDirty(false);
                  setPendingHref(null);
                  if (href) router.push(href);
                }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {t.contactForm.discardChanges}
              </button>
            </div>
          </div>
        </div>
      )}
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

      {selectedTags.map((name) => (
        <input key={name} type="hidden" name="tags" value={name} />
      ))}

      <datalist id="companyTypeOptions">
        {COMPANY_TYPES.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="industryOptions">
        {INDUSTRIES.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <Card color="general" title={t.contactForm.cardGeneralInfo}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Row 1 */}
          <Field label={t.contactForm.firstName} name="firstName" defaultValue={defaultValues?.firstName ?? ""} />
          <Field label={t.contactForm.lastName} name="lastName" defaultValue={defaultValues?.lastName ?? ""} />
          <Field label={t.contactForm.company} name="company" defaultValue={defaultValues?.company ?? ""} />
          <div className="flex flex-col lg:row-span-4">
            <label className={LABEL_CLASS}>{t.contactForm.tags}</label>
            <div className="mt-1 max-h-[28rem] flex-1 overflow-y-auto rounded-md border border-card-border bg-field-bg p-2">
              {sortedTags.length === 0 && <p className="px-1 py-1 text-sm text-soft">—</p>}
              {languageTagList.map((tag) => (
                <TagCheckbox
                  key={tag.id}
                  tag={tag}
                  checked={selectedTags.includes(tag.name)}
                  onToggle={() =>
                    setSelectedTags((prev) => (prev.includes(tag.name) ? prev.filter((n) => n !== tag.name) : [...prev, tag.name]))
                  }
                />
              ))}
              {languageTagList.length > 0 && personalTagList.length > 0 && (
                <div className="my-2 border-t-2 border-dashed border-ink/20" />
              )}
              {personalTagList.map((tag) => (
                <TagCheckbox
                  key={tag.id}
                  tag={tag}
                  checked={selectedTags.includes(tag.name)}
                  onToggle={() =>
                    setSelectedTags((prev) => (prev.includes(tag.name) ? prev.filter((n) => n !== tag.name) : [...prev, tag.name]))
                  }
                />
              ))}
              {(languageTagList.length > 0 || personalTagList.length > 0) && systemeIoTagList.length > 0 && (
                <div className="my-2 border-t-2 border-dashed border-ink/20" />
              )}
              {systemeIoTagList.map((tag) => (
                <TagCheckbox
                  key={tag.id}
                  tag={tag}
                  checked={selectedTags.includes(tag.name)}
                  onToggle={() =>
                    setSelectedTags((prev) => (prev.includes(tag.name) ? prev.filter((n) => n !== tag.name) : [...prev, tag.name]))
                  }
                />
              ))}
            </div>
          </div>

          {/* Row 2 — Type of company, plus where that company is legally
              registered (separate from the contact's own mailing country). */}
          <Field
            label={t.contactForm.companyType}
            name="companyType"
            defaultValue={defaultValues?.companyType ?? ""}
            list="companyTypeOptions"
          />
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.jurisdictionCountry}</label>
            <select
              name="jurisdictionCountry"
              value={jurisdictionCountry}
              onChange={(e) => setJurisdictionCountry(e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">—</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {jurisdictionRegionOptions ? (
            <div>
              <label className={LABEL_CLASS}>
                {stateLabelForCountry(jurisdictionCountry, lang)} {t.contactForm.ofJurisdiction}
              </label>
              <select name="jurisdictionRegion" defaultValue={normalizedJurisdictionRegion} className={FIELD_CLASS}>
                <option value="">—</option>
                {jurisdictionRegionOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.name} ({opt.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Field
              label={`${stateLabelForCountry(jurisdictionCountry, lang)} ${t.contactForm.ofJurisdiction}`}
              name="jurisdictionRegion"
              defaultValue={defaultValues?.jurisdictionRegion ?? ""}
            />
          )}

          {/* Row 3 — the 3rd column starts the Local Time There card, which
              spans down into Row 4 so its bottom lines up with Stage/Time
              Zone's bottom instead of just the Time Zone field's. */}
          <Field label={t.contactForm.industry} name="industry" defaultValue={defaultValues?.industry ?? ""} list="industryOptions" />
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.language}</label>
            <div className="mt-2 flex items-center gap-4 text-sm text-ink">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="locale"
                  value="en"
                  defaultChecked={(defaultValues?.locale ?? "en").toLowerCase().startsWith("en")}
                  className="accent-amo-lime"
                />
                {t.team.english}
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="locale"
                  value="fr"
                  defaultChecked={(defaultValues?.locale ?? "").toLowerCase().startsWith("fr")}
                  className="accent-amo-lime"
                />
                {t.team.french}
              </label>
            </div>
          </div>
          <div className="flex flex-col justify-end lg:row-span-2">
            {timeZone ? <LocalTimeCard timeZone={timeZone} hour12={hour12} lang={lang} label={t.contactForm.timeZoneNow} /> : null}
          </div>

          {/* Row 4 */}
          <Field
            label={t.contactForm.stage}
            name="stage"
            as="select"
            defaultValue={defaultValues?.stage ?? "LEAD"}
            options={STAGES}
          />
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.timeZone}</label>
            <select
              name="timeZone"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">—</option>
              {timeZoneOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Field label={t.contactForm.website} name="website" type="url" defaultValue={defaultValues?.website ?? ""} placeholder="https://…" />
        </div>

        {/* Only ever populated by the Google Contacts import (see
            actions/google-contacts.ts) — a personal contact's nickname, job
            title, birthday, and (read-only) Google avatar. Folded in here as
            a sub-card, same treatment the Invoice fields used to get before
            Invoice was pulled out into its own top-level card. */}
        <div className="rounded-lg border border-card-border bg-black/[0.02] p-4">
          <h3 className={LABEL_CLASS}>{t.contactForm.cardPersonalInfo}</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {defaultValues?.avatarUrl && (
              <div className="flex items-center gap-3 lg:col-span-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- an arbitrary external Google-hosted URL, not a local/optimizable asset */}
                <img src={defaultValues.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
              </div>
            )}
            <Field label={t.contactForm.nickname} name="nickname" defaultValue={defaultValues?.nickname ?? ""} />
            <Field label={t.contactForm.jobTitle} name="jobTitle" defaultValue={defaultValues?.jobTitle ?? ""} />
            <Field
              label={t.contactForm.birthday}
              name="birthday"
              defaultValue={defaultValues?.birthday ?? ""}
              placeholder="YYYY-MM-DD"
            />
          </div>
        </div>
      </Card>

      <Card color="contact" title={t.contactForm.cardContactInfo}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.7fr)_minmax(0,1.9fr)]">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className={LABEL_CLASS}>{t.contactForm.emails}</label>
            <div className="mt-1 space-y-1.5">
              <input
                type="email"
                name="email"
                defaultValue={defaultValues?.email ?? ""}
                aria-label={t.contactForm.email}
                className={`${FIELD_CLASS} mt-0`}
              />
              <input
                type="email"
                name="email2"
                defaultValue={defaultValues?.email2 ?? ""}
                aria-label={t.contactForm.email2}
                className={`${FIELD_CLASS} mt-0`}
              />
              {extraEmails.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5">
                  <input
                    type="email"
                    name="extraEmails"
                    defaultValue={row.value}
                    className={`${FIELD_CLASS} mt-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => setExtraEmails((rows) => rows.filter((r) => r.id !== row.id))}
                    className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
                    aria-label={t.contactForm.removeEntry}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setExtraEmails((rows) => [...rows, { id: nextEmailId.current++, value: "" }])}
                className="text-xs font-semibold text-amo-lime hover:underline"
              >
                + {t.contactForm.addEmail}
              </button>
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.contactDetail.fieldPhones}</label>
            <div className="mt-1 space-y-1.5">
              <PhoneField name="phone" label={t.contactForm.phone} defaultCountry={phoneCountry} defaultValue={defaultValues?.phone} hideLabel />
              <PhoneField name="phone2" label={t.contactForm.phone2} defaultCountry={phoneCountry} defaultValue={defaultValues?.phone2} hideLabel />
              {extraPhones.map((row) => (
                <PhoneField
                  key={row.id}
                  name="extraPhones"
                  label=""
                  defaultCountry={phoneCountry}
                  defaultValue={row.value}
                  hideLabel
                  onRemove={() => setExtraPhones((rows) => rows.filter((r) => r.id !== row.id))}
                  removeLabel={t.contactForm.removeEntry}
                />
              ))}
              <button
                type="button"
                onClick={() => setExtraPhones((rows) => [...rows, { id: nextPhoneId.current++, value: "" }])}
                className="text-xs font-semibold text-amo-lime hover:underline"
              >
                + {t.contactForm.addPhone}
              </button>
            </div>
          </div>
          <AppHandleList
            title={t.contactForm.messagingAppsTitle}
            addLabel={t.contactForm.addMessagingApp}
            handlePlaceholder={t.contactForm.messagingHandle}
            appFieldName="messagingApp"
            handleFieldName="messagingHandle"
            appOptions={MESSAGING_APPS}
            rows={messagingAccounts}
            setRows={setMessagingAccounts}
            removeLabel={t.contactForm.removeEntry}
            onAdd={() => setMessagingAccounts((rows) => [...rows, { id: nextMessagingId.current++, app: MESSAGING_APPS[0], handle: "" }])}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card color="social" title={t.contactForm.cardSocialMedia}>
          <div className="space-y-1.5">
            {socialLinks.map((row) => (
              <div key={row.id} className="flex items-center gap-1.5">
                <AppSelect
                  name="socialPlatform"
                  value={row.platform}
                  onChange={(platform) => setSocialLinks((rows) => rows.map((r) => (r.id === row.id ? { ...r, platform } : r)))}
                  options={SOCIAL_PLATFORMS}
                />
                <input
                  type="url"
                  name="socialUrl"
                  defaultValue={row.url}
                  placeholder="https://…"
                  className={`${FIELD_CLASS} mt-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={() => setSocialLinks((rows) => rows.filter((r) => r.id !== row.id))}
                  className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
                  aria-label={t.contactForm.removeEntry}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSocialLinks((rows) => [...rows, { id: nextSocialId.current++, platform: "Facebook", url: "" }])}
              className="text-xs font-semibold text-amo-lime hover:underline"
            >
              + {t.contactForm.addSocialLink}
            </button>
          </div>
        </Card>

        <Card color="voip" title={t.contactForm.cardVoipApps}>
          <AppHandleListBody
            addLabel={t.contactForm.addVoipApp}
            handlePlaceholder={t.contactForm.voipHandle}
            appFieldName="voipApp"
            handleFieldName="voipHandle"
            appOptions={VOIP_APPS}
            rows={voipAccounts}
            setRows={setVoipAccounts}
            removeLabel={t.contactForm.removeEntry}
            onAdd={() => setVoipAccounts((rows) => [...rows, { id: nextVoipId.current++, app: VOIP_APPS[0], handle: "" }])}
          />
        </Card>
      </div>

      <Card color="addresses" title={t.contactForm.cardAddresses}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <AddressGroup title={t.contactForm.mainAddressTitle} prefix="" t={t} lang={lang} values={defaultValues} />
            {extraAddresses.map((row) => (
              <AddressGroup
                key={row.id}
                title={row.description?.trim() || t.contactForm.additionalAddressTitle}
                prefix="extraAddress"
                t={t}
                lang={lang}
                values={row}
                onRemove={() => setExtraAddresses((rows) => rows.filter((r) => r.id !== row.id))}
                removeLabel={t.contactForm.removeEntry}
                showDescription
              />
            ))}
            <button
              type="button"
              onClick={() =>
                setExtraAddresses((rows) => [
                  ...rows,
                  { id: nextAddressId.current++, description: "", address: "", city: "", state: "", zip: "", country: "Canada" },
                ])
              }
              className="text-xs font-semibold text-amo-lime hover:underline"
            >
              + {t.contactForm.addAddress}
            </button>
          </div>
          <div className="self-start">
            <AddressGroup title={t.contactForm.billingAddressTitle} prefix="billing" t={t} lang={lang} values={defaultValues}>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label={t.contactForm.billingContactName}
                  name="billingContactName"
                  defaultValue={defaultValues?.billingContactName ?? ""}
                />
                <PhoneField
                  name="billingPhone"
                  label={t.contactForm.billingPhone}
                  defaultCountry={billingPhoneCountry}
                  defaultValue={defaultValues?.billingPhone}
                />
              </div>
              <Field label={t.contactForm.billingEmail} name="billingEmail" type="email" defaultValue={defaultValues?.billingEmail ?? ""} />
            </AddressGroup>
          </div>
        </div>
      </Card>

      <Card color="billing" title={t.contactForm.cardInvoice}>
        <div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="autoSendInvoiceReminders"
              defaultChecked={defaultValues?.autoSendInvoiceReminders ?? false}
              className="accent-amo-lime"
            />
            {t.contactForm.autoSendInvoiceReminders}
          </label>
          <p className="mt-1 text-xs text-soft">{t.contactForm.autoSendInvoiceRemindersHelp}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.preferredCurrency}</label>
            <select name="preferredCurrency" defaultValue={defaultValues?.preferredCurrency ?? ""} className={FIELD_CLASS}>
              <option value="">—</option>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.paymentTerms}</label>
            <select name="paymentTerms" defaultValue={defaultValues?.paymentTerms ?? ""} className={FIELD_CLASS}>
              <option value="">—</option>
              {PAYMENT_TERMS.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.paymentSchedule}</label>
            <select name="paymentSchedule" defaultValue={defaultValues?.paymentSchedule ?? ""} className={FIELD_CLASS}>
              <option value="">—</option>
              {PAYMENT_SCHEDULES.map((schedule) => (
                <option key={schedule} value={schedule}>
                  {schedule}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.defaultDiscount}</label>
            <input
              type="number"
              name="defaultDiscount"
              min={0}
              max={100}
              step="0.1"
              defaultValue={defaultValues?.defaultDiscount ?? ""}
              className={FIELD_CLASS}
            />
          </div>
        </div>
      </Card>

      <Card color="techStack" title={t.contactForm.techStackTitle}>
        <div className="overflow-x-auto rounded-lg border border-card-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border bg-black/[0.02] text-left text-xs uppercase tracking-wide text-soft">
                <th className="px-3 py-2 font-semibold"></th>
                <th className="px-3 py-2 font-semibold">{t.contactForm.domain}</th>
                <th className="px-3 py-2 font-semibold">{t.contactForm.hostingProvider}</th>
                <th className="px-3 py-2 font-semibold">{t.contactForm.appColumn}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              <TechStackRow label={t.contactForm.websiteGroupTitle} prefix="website" values={defaultValues} />
              <TechStackRow label={t.contactForm.funnelsGroupTitle} prefix="funnels" values={defaultValues} />
              <TechStackRow label={t.contactForm.emailGroupTitle} prefix="email" values={defaultValues} appSuffix="MarketingApp" />
              <TechStackRow label={t.contactForm.storeGroupTitle} prefix="store" values={defaultValues} />
              {techStackItems.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    <input
                      name="techStackLabel"
                      defaultValue={row.label}
                      placeholder={t.contactForm.techStackLabelPlaceholder}
                      className={TABLE_INPUT_CLASS}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input name="techStackDomain" defaultValue={row.domain ?? ""} className={TABLE_INPUT_CLASS} />
                  </td>
                  <td className="px-3 py-2">
                    <input name="techStackHostingProvider" defaultValue={row.hostingProvider ?? ""} className={TABLE_INPUT_CLASS} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input name="techStackApp" defaultValue={row.app ?? ""} className={TABLE_INPUT_CLASS} />
                      <button
                        type="button"
                        onClick={() => setTechStackItems((rows) => rows.filter((r) => r.id !== row.id))}
                        className="shrink-0 rounded-md border border-card-border px-2 py-1.5 text-xs text-soft hover:text-ink"
                        aria-label={t.contactForm.removeEntry}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() =>
            setTechStackItems((rows) => [...rows, { id: nextTechStackId.current++, label: "", domain: "", hostingProvider: "", app: "" }])
          }
          className="text-xs font-semibold text-amo-lime hover:underline"
        >
          + {t.contactForm.addTechStackRow}
        </button>
      </Card>

      <Card color="domains" title={t.contactForm.cardDomains}>
        <div className="overflow-x-auto rounded-lg border border-card-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border bg-black/[0.02] text-left text-xs uppercase tracking-wide text-soft">
                <th className="px-3 py-2 font-semibold">{t.contactForm.domain}</th>
                <th className="px-3 py-2 font-semibold">{t.contactForm.registrar}</th>
                <th className="px-3 py-2 font-semibold">{t.contactForm.dnsProvider}</th>
                <th className="px-3 py-2 font-semibold">{t.contactForm.expiryDate}</th>
                <th className="px-3 py-2 font-semibold">{t.contactForm.autoRenew}</th>
                <th className="px-3 py-2 font-semibold">{t.contactForm.managedBy}</th>
                <th className="px-3 py-2 font-semibold">{t.contactForm.notes}</th>
                <th className="px-3 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {domains.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    <input name="domainDomain" defaultValue={row.domain} placeholder="example.com" className={TABLE_INPUT_CLASS} />
                  </td>
                  <td className="px-3 py-2">
                    <input name="domainRegistrar" defaultValue={row.registrar ?? ""} className={TABLE_INPUT_CLASS} />
                  </td>
                  <td className="px-3 py-2">
                    <input name="domainDnsProvider" defaultValue={row.dnsProvider ?? ""} className={TABLE_INPUT_CLASS} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="date" name="domainExpiryDate" defaultValue={row.expiryDate ?? ""} className={TABLE_INPUT_CLASS} />
                  </td>
                  <td className="px-3 py-2">
                    <select name="domainAutoRenew" defaultValue={row.autoRenew ? "on" : "off"} className={TABLE_INPUT_CLASS}>
                      <option value="off">{t.contactForm.no}</option>
                      <option value="on">{t.contactForm.yes}</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input name="domainManagedBy" defaultValue={row.managedBy ?? ""} className={TABLE_INPUT_CLASS} />
                  </td>
                  <td className="px-3 py-2">
                    <input name="domainNotes" defaultValue={row.notes ?? ""} className={TABLE_INPUT_CLASS} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setDomains((rows) => rows.filter((r) => r.id !== row.id))}
                      className="shrink-0 rounded-md border border-card-border px-2 py-1.5 text-xs text-soft hover:text-ink"
                      aria-label={t.contactForm.removeEntry}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() =>
            setDomains((rows) => [
              ...rows,
              { id: nextDomainId.current++, domain: "", registrar: "", dnsProvider: "", expiryDate: "", autoRenew: false, managedBy: "", notes: "" },
            ])
          }
          className="text-xs font-semibold text-amo-lime hover:underline"
        >
          + {t.contactForm.addDomain}
        </button>
      </Card>

      {allContacts && allContacts.length > 0 && (
        <Card color="relations" title={t.contactForm.cardRelatedContacts}>
          <div className="space-y-1.5">
            {relations.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-1.5">
                <select
                  name="relationContactId"
                  defaultValue={row.relatedContactId}
                  className={`${FIELD_CLASS} mt-0 w-full sm:w-56`}
                >
                  <option value="">—</option>
                  {allContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || c.id}
                    </option>
                  ))}
                </select>
                <input
                  name="relationType"
                  defaultValue={row.relationType}
                  list="relationTypeOptions"
                  placeholder={t.contactForm.relationTypePlaceholder}
                  className={`${FIELD_CLASS} mt-0 w-40`}
                />
                <input
                  name="relationNotes"
                  defaultValue={row.notes ?? ""}
                  placeholder={t.contactForm.notes}
                  className={`${FIELD_CLASS} mt-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={() => setRelations((rows) => rows.filter((r) => r.id !== row.id))}
                  className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
                  aria-label={t.contactForm.removeEntry}
                >
                  ✕
                </button>
              </div>
            ))}
            <datalist id="relationTypeOptions">
              {RELATION_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => setRelations((rows) => [...rows, { id: nextRelationId.current++, relatedContactId: "", relationType: "Other", notes: "" }])}
              className="text-xs font-semibold text-amo-lime hover:underline"
            >
              + {t.contactForm.addRelatedContact}
            </button>
          </div>
        </Card>
      )}

      <Card color="other" title={t.contactForm.cardOtherInfo}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className={LABEL_CLASS}>{t.contactDetail.fieldSource}</p>
            {isManual ? (
              <input name="source" defaultValue={defaultValues?.source ?? "manual"} className={FIELD_CLASS} />
            ) : (
              <p className="mt-1 text-sm text-ink">{defaultValues?.source ?? "—"}</p>
            )}
          </div>
          <div>
            <p className={LABEL_CLASS}>{t.contactDetail.registeredPrefix}</p>
            <p className="mt-1 text-sm text-ink">{registeredAt ? format(new Date(registeredAt), "PP", { locale: dateLocale }) : "—"}</p>
          </div>
          <div>
            <p className={LABEL_CLASS}>{t.contactDetail.lastSyncedPrefix}</p>
            <p className="mt-1 text-sm text-ink">
              {defaultValues?.lastSyncedAt
                ? formatDistanceToNow(new Date(defaultValues.lastSyncedAt), { addSuffix: true, locale: dateLocale })
                : "—"}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>{t.contactDetail.servicesRequiredLabel}</label>
            <input type="hidden" name="servicesRequiredSlug" value={servicesRequired?.fieldSlug ?? SERVICES_REQUIRED_DEFAULT_SLUG} />
            <textarea name="servicesRequired" rows={2} defaultValue={servicesRequired?.value ?? ""} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.contactDetail.projectGoalLabel}</label>
            <input type="hidden" name="projectGoalDescriptionSlug" value={projectGoal?.fieldSlug ?? PROJECT_GOAL_DEFAULT_SLUG} />
            <textarea name="projectGoalDescription" rows={2} defaultValue={projectGoal?.value ?? ""} className={FIELD_CLASS} />
          </div>
        </div>

        {/* Per-external-app sync configuration — see CONTACT_SYNC_APPS in
            src/lib/contact-sync.ts. New apps just add an entry there; this
            list renders whatever's in the registry rather than hardcoding
            google_contacts/systeme_io by name. */}
        <div className="rounded-lg border border-card-border bg-black/[0.02] p-4">
          <h3 className={LABEL_CLASS}>{t.contactForm.appSyncTitle}</h3>
          <p className="mt-1 text-xs text-soft">{t.contactForm.appSyncHelp}</p>
          <div className="mt-3 space-y-2">
            {CONTACT_SYNC_APPS.map((def) => {
              const current = appSync[def.app];
              return (
                <div key={def.app} className="flex flex-wrap items-center gap-3 rounded-md border border-card-border bg-card-bg px-3 py-2">
                  <label className="flex min-w-[10rem] flex-1 items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      name={`appSyncEnabled_${def.app}`}
                      checked={current.enabled}
                      onChange={(e) => setAppSync((prev) => ({ ...prev, [def.app]: { ...prev[def.app], enabled: e.target.checked } }))}
                      className="accent-amo-lime"
                    />
                    {t.contactForm.syncAppLabels[def.labelKey as keyof typeof t.contactForm.syncAppLabels] ?? def.app}
                  </label>
                  <select
                    name={`appSyncDirection_${def.app}`}
                    value={current.direction}
                    onChange={(e) =>
                      setAppSync((prev) => ({ ...prev, [def.app]: { ...prev[def.app], direction: e.target.value as ContactSyncDirection } }))
                    }
                    disabled={!current.enabled}
                    className="rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm disabled:opacity-50"
                  >
                    <option value="BOTH">{t.contactForm.syncDirectionBoth}</option>
                    <option value="TO_APP">{t.contactForm.syncDirectionToApp}</option>
                    <option value="FROM_APP">{t.contactForm.syncDirectionFromApp}</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card color="notes" title={t.contactForm.cardNotes}>
        <textarea name="notes" rows={3} defaultValue={defaultValues?.notes ?? ""} className={FIELD_CLASS} />
      </Card>
    </form>

    {contactId && isAdmin && (
      <div className="mt-6">
        <ContactCredentialsCard contactId={contactId} entries={credentialEntries ?? []} lang={lang} />
      </div>
    )}
    </>
  );
}

// A colored checkbox row matching this tag's pill color on the Contacts
// list page, instead of a plain checkbox + label.
function TagCheckbox({
  tag,
  checked,
  onToggle,
}: {
  tag: { id: string } & TagLike;
  checked: boolean;
  onToggle: () => void;
}) {
  const { className, style } = tagPillStyle(tag);
  return (
    <label
      className={`mt-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm first:mt-0 ${className}`}
      style={style}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 rounded border-card-border accent-amo-lime" />
      {tag.name}
    </label>
  );
}

// A native <select> with a live icon preview beside it (updates as the
// selection changes) — a real browser <select>'s own <option> list can't
// show images, so this is as "visual" as a plain form control gets short of
// building a whole custom listbox.
export function AppSelect({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <PlatformIcon platform={value} className="h-5 w-5 shrink-0" />
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0 w-32 shrink-0 rounded-md border border-card-border bg-field-bg px-2 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      >
        {options.map((app) => (
          <option key={app} value={app}>
            {app}
          </option>
        ))}
      </select>
    </div>
  );
}

// Shared shape for the Instant messaging apps and Preferred VoIP apps
// sections — both are an unlimited list of (app, handle) rows with a live
// icon preview, an "add" button, and a remove button per row.
export function AppHandleListBody({
  addLabel,
  handlePlaceholder,
  appFieldName,
  handleFieldName,
  appOptions,
  rows,
  setRows,
  removeLabel,
  onAdd,
}: {
  addLabel: string;
  handlePlaceholder: string;
  appFieldName: string;
  handleFieldName: string;
  appOptions: string[];
  rows: { id: number; app: string; handle: string }[];
  setRows: React.Dispatch<React.SetStateAction<{ id: number; app: string; handle: string }[]>>;
  removeLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-1.5">
          <AppSelect
            name={appFieldName}
            value={row.app}
            onChange={(app) => setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, app } : r)))}
            options={appOptions}
          />
          <input
            type="text"
            name={handleFieldName}
            defaultValue={row.handle}
            placeholder={handlePlaceholder}
            className={`${FIELD_CLASS} mt-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
            className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
            aria-label={removeLabel}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd} className="text-xs font-semibold text-amo-lime hover:underline">
        + {addLabel}
      </button>
    </div>
  );
}

export function AppHandleList(
  props: Parameters<typeof AppHandleListBody>[0] & { title: string }
) {
  const { title, ...rest } = props;
  return (
    <div>
      <label className={LABEL_CLASS}>{title}</label>
      <div className="mt-1">
        <AppHandleListBody {...rest} />
      </div>
    </div>
  );
}

export function AddressGroup({
  title,
  prefix,
  t,
  lang,
  values,
  children,
  onRemove,
  removeLabel,
  showDescription,
}: {
  title: string;
  prefix: "" | "billing" | "extraAddress";
  t: ReturnType<typeof getDict>;
  lang: Lang;
  // For "" and "billing", the full form's default values (fields already
  // live at the prefixed key, e.g. billingAddress). For "extraAddress", one
  // row's own unprefixed values ({address, city, state, zip, country}) —
  // the prefix there only applies to the submitted field *name*, so extra
  // address rows share one parallel-array name per field (getAll-able),
  // not so their own values can be looked up under it.
  values?: ContactFormValues | ExtraAddress;
  children?: React.ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  // Only extra addresses get a free-text Description ("Cottage", "Office")
  // — the main and billing addresses are already unambiguous.
  showDescription?: boolean;
}) {
  const field = (suffix: string) => (prefix ? `${prefix}${suffix}` : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  const get = (suffix: string): string => {
    const key = (prefix === "extraAddress" ? suffix.charAt(0).toLowerCase() + suffix.slice(1) : field(suffix)) as string;
    return ((values as Record<string, string | null | undefined> | undefined)?.[key]) ?? "";
  };

  // Tracked locally so the State/Province field can switch to a region
  // dropdown (or back to free text) the moment Country changes, without a
  // page reload — the dropdown's own value is normalized to that country's
  // 2-letter/short code, matching whatever's already stored when possible.
  const [country, setCountry] = useState(get("Country") || "Canada");
  const regionOptions = regionOptionsForCountry(country);
  const normalizedState = normalizeRegionForCountry(country, get("State"));

  return (
    <div className="rounded-lg border border-card-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{title}</h3>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-card-border px-2 py-1 text-xs text-soft hover:text-ink"
            aria-label={removeLabel}
          >
            ✕
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-4">
        {showDescription && (
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.addressDescription}</label>
            <input
              name={field("Description")}
              defaultValue={get("Description")}
              placeholder={t.contactForm.addressDescriptionPlaceholder}
              className={FIELD_CLASS}
            />
          </div>
        )}
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.addressLine}</label>
          <input name={field("Address")} defaultValue={get("Address")} className={FIELD_CLASS} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.contactForm.city} name={field("City")} defaultValue={get("City")} />
          {regionOptions ? (
            <div>
              <label className={LABEL_CLASS}>{stateLabelForCountry(country, lang)}</label>
              <select name={field("State")} defaultValue={normalizedState} className={FIELD_CLASS}>
                <option value="">—</option>
                {regionOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.name} ({opt.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Field label={stateLabelForCountry(country, lang)} name={field("State")} defaultValue={get("State")} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={zipLabelForCountry(country, lang)} name={field("Zip")} defaultValue={get("Zip")} />
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.country}</label>
            <select
              name={field("Country")}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={FIELD_CLASS}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export const TABLE_INPUT_CLASS =
  "w-full rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

export function TechStackRow({
  label,
  prefix,
  values,
  appSuffix = "DesignApp",
}: {
  label: string;
  prefix: "website" | "funnels" | "email" | "store";
  values?: ContactFormValues;
  appSuffix?: "DesignApp" | "MarketingApp";
}) {
  const field = (suffix: string) => `${prefix}${suffix}` as keyof ContactFormValues;
  const get = (suffix: string): string => (values?.[field(suffix)] as string | null | undefined) ?? "";

  return (
    <tr>
      <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-soft">{label}</td>
      <td className="px-3 py-2">
        <input name={field("Domain")} defaultValue={get("Domain")} className={TABLE_INPUT_CLASS} />
      </td>
      <td className="px-3 py-2">
        <input name={field("HostingProvider")} defaultValue={get("HostingProvider")} className={TABLE_INPUT_CLASS} />
      </td>
      <td className="px-3 py-2">
        <input name={field(appSuffix)} defaultValue={get(appSuffix)} className={TABLE_INPUT_CLASS} />
      </td>
    </tr>
  );
}

export function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  as,
  options,
  list,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | null;
  as?: "select";
  options?: { value: string; label: string }[];
  list?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className={LABEL_CLASS}>
        {label}
      </label>
      {as === "select" ? (
        <select id={name} name={name} defaultValue={defaultValue ?? ""} className={FIELD_CLASS}>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue ?? ""}
          list={list}
          placeholder={placeholder}
          className={FIELD_CLASS}
        />
      )}
    </div>
  );
}
