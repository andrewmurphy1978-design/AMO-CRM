"use client";

import { useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { COUNTRIES } from "@/lib/countries";
import { regionOptionsForCountry, normalizeRegionForCountry } from "@/lib/regions";
import { stateLabelForCountry } from "@/lib/address-labels";
import { COMPANY_TYPES } from "@/lib/company-types";
import { INDUSTRIES } from "@/lib/industries";
import { getWorldTimeZoneOptions } from "@/lib/timezones";
import LocalTimeCard from "@/components/local-time-card";
import { Field, FIELD_CLASS, LABEL_CLASS } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";

export interface GeneralInfoValues {
  firstName?: string | null;
  lastName?: string | null;
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
  stage: string;
  source?: string | null;
  systemeIoId?: number | null;
}

export default function GeneralInfoDialog({
  action,
  values,
  lang,
  hour12,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  values: GeneralInfoValues;
  lang: Lang;
  hour12: boolean;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const [jurisdictionCountry, setJurisdictionCountry] = useState(values.jurisdictionCountry ?? "");
  const jurisdictionRegionOptions = regionOptionsForCountry(jurisdictionCountry);
  const normalizedJurisdictionRegion = normalizeRegionForCountry(jurisdictionCountry, values.jurisdictionRegion ?? "");
  const [timeZone, setTimeZone] = useState(values.timeZone ?? "");
  const [timeZoneOptions] = useState(() => getWorldTimeZoneOptions());
  const isManual = !values.systemeIoId;

  const STAGES = [
    { value: "LEAD", label: t.stages.LEAD },
    { value: "PROSPECT", label: t.stages.PROSPECT },
    { value: "CLIENT", label: t.stages.CLIENT },
    { value: "PAST_CLIENT", label: t.stages.PAST_CLIENT },
    { value: "UNSUBSCRIBED", label: t.stages.UNSUBSCRIBED },
    { value: "PERSONAL", label: t.stages.PERSONAL },
  ];

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
      <SectionDialog open={open} onOpenChange={setOpen} title={t.contactForm.cardGeneralInfo} action={action} labels={t.phaseDialog} wide>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t.contactForm.firstName} name="firstName" defaultValue={values.firstName} />
        <Field label={t.contactForm.lastName} name="lastName" defaultValue={values.lastName} />
        <Field label={t.contactForm.company} name="company" defaultValue={values.company} />
        <Field label={t.contactForm.companyType} name="companyType" defaultValue={values.companyType} list="companyTypeOptions" />
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
            defaultValue={values.jurisdictionRegion}
          />
        )}
        <Field label={t.contactForm.industry} name="industry" defaultValue={values.industry} list="industryOptions" />
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.language}</label>
          <div className="mt-2 flex items-center gap-4 text-sm text-ink">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="locale" value="en" defaultChecked={(values.locale ?? "en").toLowerCase().startsWith("en")} className="accent-amo-lime" />
              {t.team.english}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="locale" value="fr" defaultChecked={(values.locale ?? "").toLowerCase().startsWith("fr")} className="accent-amo-lime" />
              {t.team.french}
            </label>
          </div>
        </div>
        <Field label={t.contactForm.stage} name="stage" as="select" defaultValue={values.stage} options={STAGES} />
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.timeZone}</label>
          <select name="timeZone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className={FIELD_CLASS}>
            <option value="">—</option>
            {timeZoneOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {timeZone && (
          <div className="flex flex-col justify-end">
            <LocalTimeCard timeZone={timeZone} hour12={hour12} lang={lang} label={t.contactForm.timeZoneNow} />
          </div>
        )}
        <Field label={t.contactForm.website} name="website" type="url" defaultValue={values.website} placeholder="https://…" />
        {isManual && <Field label={t.contactDetail.fieldSource} name="source" defaultValue={values.source} />}
      </div>

      <div className="rounded-lg border border-card-border bg-black/[0.02] p-3">
        <h3 className={LABEL_CLASS}>{t.contactForm.cardPersonalInfo}</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {values.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- an arbitrary external Google-hosted URL, not a local/optimizable asset
            <img src={values.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
          )}
          <Field label={t.contactForm.nickname} name="nickname" defaultValue={values.nickname} />
          <Field label={t.contactForm.jobTitle} name="jobTitle" defaultValue={values.jobTitle} />
          <Field label={t.contactForm.birthday} name="birthday" defaultValue={values.birthday} placeholder="YYYY-MM-DD" />
        </div>
      </div>

      <datalist id="companyTypeOptions">
        {COMPANY_TYPES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="industryOptions">
        {INDUSTRIES.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      </SectionDialog>
    </>
  );
}
