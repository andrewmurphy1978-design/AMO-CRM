"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import type { Locale } from "date-fns";
import { format, formatDistanceToNow } from "date-fns";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { COUNTRIES } from "@/lib/countries";
import { countryToCode } from "@/lib/country-flag";
import { regionOptionsForCountry, normalizeRegionForCountry } from "@/lib/regions";
import PhoneField from "@/components/phone-field";
import PlatformIcon from "@/components/platform-icon";
import { MESSAGING_APPS, VOIP_APPS } from "@/lib/platform-icons";
import { getWorldTimeZoneOptions } from "@/lib/timezones";
import PageHeader from "../page-header";

type ExtraAddress = { address?: string | null; city?: string | null; state?: string | null; zip?: string | null; country?: string | null };
type AppHandleRow = { app: string; handle: string };

type ContactFormValues = {
  email?: string;
  email2?: string | null;
  extraEmails?: string[] | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  phone2?: string | null;
  extraPhones?: string[] | null;
  company?: string | null;
  locale?: string | null;
  timeZone?: string | null;
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
  notes?: string | null;
  source?: string | null;
  systemeIoRegisteredAt?: Date | string | null;
  lastSyncedAt?: Date | string | null;
};

const SOCIAL_PLATFORMS = ["Facebook", "Instagram", "LinkedIn", "TikTok", "YouTube", "X", "Website", "Other"];

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

export default function ContactForm({
  action,
  defaultValues,
  submitLabel,
  lang,
  allTags,
  currentTags,
  title,
  hour12,
  dateLocale,
  location,
}: {
  action: (
    prevState: { error?: string; success?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string }>;
  defaultValues?: ContactFormValues;
  submitLabel: string;
  lang: Lang;
  allTags: { id: string; name: string }[];
  currentTags?: string[];
  title: ReactNode;
  hour12: boolean;
  dateLocale: Locale | undefined;
  location: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = getDict(lang);
  const [selectedTags, setSelectedTags] = useState<string[]>(currentTags ?? []);

  // Every world timezone, sorted west to east — computed once (deterministic
  // given a fixed reference date, so no server/client hydration mismatch).
  const [timeZoneOptions] = useState(() => getWorldTimeZoneOptions());

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
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      {selectedTags.map((name) => (
        <input key={name} type="hidden" name="tags" value={name} />
      ))}

      {/* Line 1: Email (stacked), Phone numbers (stacked), Instant messaging
          apps (stacked — WhatsApp is just another row here now, no more
          separate dedicated field/column). */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.7fr)_minmax(0,1.9fr)]">
        <div className="sm:col-span-2 lg:col-span-1 space-y-1.5">
          <Field label={t.contactForm.email} name="email" type="email" required defaultValue={defaultValues?.email} />
          <input
            type="email"
            name="email2"
            defaultValue={defaultValues?.email2 ?? ""}
            aria-label={t.contactForm.email2}
            className={FIELD_CLASS}
          />
          {extraEmails.map((row) => (
            <div key={row.id} className="flex items-end gap-1.5">
              <div className="flex-1">
                <input
                  type="email"
                  name="extraEmails"
                  defaultValue={row.value}
                  className={FIELD_CLASS}
                />
              </div>
              <button
                type="button"
                onClick={() => setExtraEmails((rows) => rows.filter((r) => r.id !== row.id))}
                className="mb-0.5 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
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

      {/* Name + Stage + Tags (checkbox listbox, spans down beside Company/
          Language below it) + Company + Language + Time Zone */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t.contactForm.firstName} name="firstName" defaultValue={defaultValues?.firstName ?? ""} />
        <Field label={t.contactForm.lastName} name="lastName" defaultValue={defaultValues?.lastName ?? ""} />
        <Field
          label={t.contactForm.stage}
          name="stage"
          as="select"
          defaultValue={defaultValues?.stage ?? "LEAD"}
          options={STAGES}
        />
        <div className="lg:row-span-2">
          <label className={LABEL_CLASS}>{t.contactForm.tags}</label>
          <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-card-border bg-field-bg p-2">
            {allTags.length === 0 && <p className="px-1 py-1 text-sm text-soft">—</p>}
            {allTags.map((tag) => (
              <label key={tag.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-ink hover:bg-black/5">
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.name)}
                  onChange={() =>
                    setSelectedTags((prev) => (prev.includes(tag.name) ? prev.filter((n) => n !== tag.name) : [...prev, tag.name]))
                  }
                  className="h-4 w-4 rounded border-card-border accent-amo-lime"
                />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
        <Field label={t.contactForm.company} name="company" defaultValue={defaultValues?.company ?? ""} />
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
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.timeZone}</label>
          <select name="timeZone" defaultValue={defaultValues?.timeZone ?? ""} className={FIELD_CLASS}>
            <option value="">—</option>
            {timeZoneOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Addresses — Main (plus any extra addresses added via "+", same
          pattern as extra emails/phones) and Billing, equal-width columns. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <AddressGroup title={t.contactForm.mainAddressTitle} prefix="" t={t} values={defaultValues} />
          {extraAddresses.map((row) => (
            <AddressGroup
              key={row.id}
              title={t.contactForm.additionalAddressTitle}
              prefix="extraAddress"
              t={t}
              values={row}
              onRemove={() => setExtraAddresses((rows) => rows.filter((r) => r.id !== row.id))}
              removeLabel={t.contactForm.removeEntry}
            />
          ))}
          <button
            type="button"
            onClick={() =>
              setExtraAddresses((rows) => [...rows, { id: nextAddressId.current++, address: "", city: "", state: "", zip: "", country: "Canada" }])
            }
            className="text-xs font-semibold text-amo-lime hover:underline"
          >
            + {t.contactForm.addAddress}
          </button>
        </div>
        <AddressGroup title={t.contactForm.billingAddressTitle} prefix="billing" t={t} values={defaultValues}>
          <Field label={t.contactForm.billingContactName} name="billingContactName" defaultValue={defaultValues?.billingContactName ?? ""} />
          <Field label={t.contactForm.billingEmail} name="billingEmail" type="email" defaultValue={defaultValues?.billingEmail ?? ""} />
          <PhoneField
            name="billingPhone"
            label={t.contactForm.billingPhone}
            defaultCountry={billingPhoneCountry}
            defaultValue={defaultValues?.billingPhone}
          />
        </AddressGroup>
      </div>

      {/* Tech stack — one row per Website/Funnels/Email/Store, columns
          Domain/Provider/App, plus any custom rows added via "+". */}
      <div>
        <h3 className={LABEL_CLASS}>{t.contactForm.techStackTitle}</h3>
        <div className="mt-2 overflow-x-auto rounded-lg border border-card-border">
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
          className="mt-2 text-xs font-semibold text-amo-lime hover:underline"
        >
          + {t.contactForm.addTechStackRow}
        </button>
      </div>

      {/* Social media links — unlimited rows, e.g. a personal profile and a
          separate business page on the same platform */}
      <div>
        <label className={LABEL_CLASS}>{t.contactForm.socialLinksTitle}</label>
        <div className="mt-1 space-y-1.5">
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
      </div>

      {/* Preferred VoIP apps — separate from the instant-messaging list
          above (a contact can chat on WhatsApp but prefer Zoom for calls). */}
      <AppHandleList
        title={t.contactForm.voipAppsTitle}
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

      {/* Read-only systeme.io sync info — nothing here is submitted with the
          form, it's just where the contact's own record came from. */}
      <div className="rounded-lg border border-card-border bg-black/[0.02] p-4">
        <h3 className={LABEL_CLASS}>{t.contactForm.systemeIoInfoTitle}</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <p className={LABEL_CLASS}>{t.contactDetail.fieldSource}</p>
            <p className="mt-1 text-sm text-ink">{defaultValues?.source ?? "—"}</p>
          </div>
          <div>
            <p className={LABEL_CLASS}>{t.contactDetail.registeredPrefix}</p>
            <p className="mt-1 text-sm text-ink">
              {defaultValues?.systemeIoRegisteredAt
                ? format(new Date(defaultValues.systemeIoRegisteredAt), "PP", { locale: dateLocale })
                : "—"}
            </p>
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
      </div>

      <div>
        <label className={LABEL_CLASS}>{t.contactForm.notes}</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes ?? ""}
          className={FIELD_CLASS}
        />
      </div>
    </form>
  );
}

// A native <select> with a live icon preview beside it (updates as the
// selection changes) — a real browser <select>'s own <option> list can't
// show images, so this is as "visual" as a plain form control gets short of
// building a whole custom listbox.
function AppSelect({
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
function AppHandleList({
  title,
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
  title: string;
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
    <div>
      <label className={LABEL_CLASS}>{title}</label>
      <div className="mt-1 space-y-1.5">
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
    </div>
  );
}

function AddressGroup({
  title,
  prefix,
  t,
  values,
  children,
  onRemove,
  removeLabel,
}: {
  title: string;
  prefix: "" | "billing" | "extraAddress";
  t: ReturnType<typeof getDict>;
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
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.addressLine}</label>
          <input name={field("Address")} defaultValue={get("Address")} className={FIELD_CLASS} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.contactForm.city} name={field("City")} defaultValue={get("City")} />
          {regionOptions ? (
            <div>
              <label className={LABEL_CLASS}>{t.contactForm.state}</label>
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
            <Field label={t.contactForm.state} name={field("State")} defaultValue={get("State")} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.contactForm.zip} name={field("Zip")} defaultValue={get("Zip")} />
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

const TABLE_INPUT_CLASS =
  "w-full rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

function TechStackRow({
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

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  as,
  options,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | null;
  as?: "select";
  options?: { value: string; label: string }[];
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
          className={FIELD_CLASS}
        />
      )}
    </div>
  );
}
