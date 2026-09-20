"use client";

import { useActionState, useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { COUNTRIES } from "@/lib/countries";
import { countryToCode } from "@/lib/country-flag";
import PhoneField from "@/components/phone-field";
import MultiSelect from "@/components/multi-select";

type ContactFormValues = {
  email?: string;
  email2?: string | null;
  extraEmails?: string[] | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  phone2?: string | null;
  extraPhones?: string[] | null;
  whatsapp?: string | null;
  company?: string | null;
  locale?: string | null;
  stage?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  otherAddress?: string | null;
  otherCity?: string | null;
  otherState?: string | null;
  otherZip?: string | null;
  otherCountry?: string | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingZip?: string | null;
  billingCountry?: string | null;
  billingContactName?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
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
  socialLinks?: { platform: string; url: string }[] | null;
  notes?: string | null;
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
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = getDict(lang);
  const [selectedTags, setSelectedTags] = useState<string[]>(currentTags ?? []);

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
      {selectedTags.map((name) => (
        <input key={name} type="hidden" name="tags" value={name} />
      ))}

      {/* Line 1: Email (wide), Phone numbers (stacked), WhatsApp */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 space-y-1.5">
          <Field label={t.contactForm.email} name="email" type="email" required defaultValue={defaultValues?.email} />
          <Field label={t.contactForm.email2} name="email2" type="email" defaultValue={defaultValues?.email2 ?? ""} />
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
              <div key={row.id} className="flex items-center gap-1.5">
                <div className="flex-1">
                  <PhoneField name="extraPhones" label="" defaultCountry={phoneCountry} defaultValue={row.value} hideLabel />
                </div>
                <button
                  type="button"
                  onClick={() => setExtraPhones((rows) => rows.filter((r) => r.id !== row.id))}
                  className="rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
                  aria-label={t.contactForm.removeEntry}
                >
                  ✕
                </button>
              </div>
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
        <PhoneField name="whatsapp" label={t.contactForm.whatsapp} defaultCountry={phoneCountry} defaultValue={defaultValues?.whatsapp} />
      </div>

      {/* Name + Stage + Tags */}
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
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.tags}</label>
          <div className="mt-1">
            <MultiSelect
              options={allTags.map((tag) => ({ value: tag.name, label: tag.name }))}
              selected={selectedTags}
              placeholder={t.contacts.allTags}
              onChange={setSelectedTags}
            />
          </div>
        </div>
      </div>

      {/* Line 2: Company, Language */}
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      {/* Line 3: addresses — Main, Other, Billing side by side */}
      <div className="grid gap-4 lg:grid-cols-3">
        <AddressGroup title={t.contactForm.mainAddressTitle} prefix="" t={t} values={defaultValues} />
        <AddressGroup title={t.contactForm.otherAddressTitle} prefix="other" t={t} values={defaultValues} />
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

      {/* Line 4: tech stack — Website, Funnels, Email, Store side by side */}
      <div className="grid gap-4 lg:grid-cols-4">
        <TechStackGroup title={t.contactForm.websiteGroupTitle} prefix="website" t={t} values={defaultValues} />
        <TechStackGroup title={t.contactForm.funnelsGroupTitle} prefix="funnels" t={t} values={defaultValues} />
        <TechStackGroup title={t.contactForm.emailGroupTitle} prefix="email" t={t} values={defaultValues} showMarketingApp />
        <TechStackGroup title={t.contactForm.storeGroupTitle} prefix="store" t={t} values={defaultValues} />
      </div>

      {/* Social media links — unlimited rows, e.g. a personal profile and a
          separate business page on the same platform */}
      <div>
        <label className={LABEL_CLASS}>{t.contactForm.socialLinksTitle}</label>
        <div className="mt-1 space-y-1.5">
          {socialLinks.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5">
              <select
                name="socialPlatform"
                defaultValue={row.platform}
                className={`${FIELD_CLASS} mt-0 w-40 shrink-0`}
              >
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
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
                className="rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
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

      <div>
        <label className={LABEL_CLASS}>{t.contactForm.notes}</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes ?? ""}
          className={FIELD_CLASS}
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}

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

function AddressGroup({
  title,
  prefix,
  t,
  values,
  children,
}: {
  title: string;
  prefix: "" | "other" | "billing";
  t: ReturnType<typeof getDict>;
  values?: ContactFormValues;
  children?: React.ReactNode;
}) {
  const field = (suffix: string) => (prefix ? `${prefix}${suffix}` : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  const get = (suffix: string): string => {
    const key = field(suffix) as keyof ContactFormValues;
    return (values?.[key] as string | null | undefined) ?? "";
  };

  return (
    <div className="rounded-lg border border-card-border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{title}</h3>
      <div className="mt-3 grid gap-4">
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.addressLine}</label>
          <input name={field("Address")} defaultValue={get("Address")} className={FIELD_CLASS} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.contactForm.city} name={field("City")} defaultValue={get("City")} />
          <Field label={t.contactForm.state} name={field("State")} defaultValue={get("State")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.contactForm.zip} name={field("Zip")} defaultValue={get("Zip")} />
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.country}</label>
            <select name={field("Country")} defaultValue={get("Country") || "Canada"} className={FIELD_CLASS}>
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

function TechStackGroup({
  title,
  prefix,
  t,
  values,
  showMarketingApp,
}: {
  title: string;
  prefix: "website" | "funnels" | "email" | "store";
  t: ReturnType<typeof getDict>;
  values?: ContactFormValues;
  showMarketingApp?: boolean;
}) {
  const field = (suffix: string) => `${prefix}${suffix}` as keyof ContactFormValues;
  const get = (suffix: string): string => (values?.[field(suffix)] as string | null | undefined) ?? "";

  return (
    <div className="rounded-lg border border-card-border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{title}</h3>
      <div className="mt-3 grid gap-4">
        <Field label={t.contactForm.domain} name={field("Domain")} defaultValue={get("Domain")} />
        <Field label={t.contactForm.hostingProvider} name={field("HostingProvider")} defaultValue={get("HostingProvider")} />
        {showMarketingApp ? (
          <Field label={t.contactForm.marketingApp} name={field("MarketingApp")} defaultValue={get("MarketingApp")} />
        ) : (
          <Field label={t.contactForm.designApp} name={field("DesignApp")} defaultValue={get("DesignApp")} />
        )}
      </div>
    </div>
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
