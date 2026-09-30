"use client";

import { useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { COUNTRIES } from "@/lib/countries";
import { regionOptionsForCountry, normalizeRegionForCountry } from "@/lib/regions";
import { stateLabelForCountry } from "@/lib/address-labels";
import { COMPANY_TYPES } from "@/lib/company-types";
import { INDUSTRIES } from "@/lib/industries";
import { getWorldTimeZoneOptions } from "@/lib/timezones";
import { normalizeFieldSlug, SERVICES_REQUIRED_DEFAULT_SLUG, PROJECT_GOAL_DEFAULT_SLUG } from "@/lib/custom-field-slugs";
import LocalTimeCard from "@/components/local-time-card";
import Combobox from "@/components/combobox";
import { CARD_COLORS } from "@/components/section-card";
import { Field, FIELD_CLASS, LABEL_CLASS } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";
import AvatarPicker from "./avatar-picker";
import TagManager from "./tag-manager";
import type { TagLike } from "@/lib/tag-colors";

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
  fieldValues?: { fieldSlug: string; value: string | null }[] | null;
}

export default function GeneralInfoDialog({
  action,
  values,
  lang,
  hour12,
  contactId,
  tags,
  allTags,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  values: GeneralInfoValues;
  lang: Lang;
  hour12: boolean;
  contactId: string;
  tags: ({ id: string } & TagLike)[];
  allTags: ({ id: string } & TagLike)[];
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const [jurisdictionCountry, setJurisdictionCountry] = useState(values.jurisdictionCountry ?? "");
  const jurisdictionRegionOptions = regionOptionsForCountry(jurisdictionCountry);
  const normalizedJurisdictionRegion = normalizeRegionForCountry(jurisdictionCountry, values.jurisdictionRegion ?? "");
  const [timeZone, setTimeZone] = useState(values.timeZone ?? "");
  const [timeZoneOptions] = useState(() => getWorldTimeZoneOptions());
  const isManual = !values.systemeIoId;
  const findFieldValue = (normalized: string) => values.fieldValues?.find((fv) => normalizeFieldSlug(fv.fieldSlug) === normalized);
  const servicesRequired = findFieldValue("servicesrequired");
  const projectGoal = findFieldValue("projectgoaldescription");

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
      <SectionDialog
        open={open}
        onOpenChange={setOpen}
        title={t.contactForm.cardGeneralInfo}
        action={action}
        labels={t.phaseDialog}
        headerColorClassName={CARD_COLORS.general}
        wide
      >
        {/* Row 1: First name / Last name / Company / Job title */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.contactForm.firstName} name="firstName" defaultValue={values.firstName} />
          <Field label={t.contactForm.lastName} name="lastName" defaultValue={values.lastName} />
          <Field label={t.contactForm.company} name="company" defaultValue={values.company} />
          <Field label={t.contactForm.jobTitle} name="jobTitle" defaultValue={values.jobTitle} />
        </div>

        {/* Row 2: Type of company / Country of jurisdiction / Region of jurisdiction / Industry */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Combobox label={t.contactForm.companyType} name="companyType" defaultValue={values.companyType} options={COMPANY_TYPES} />
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
          <Combobox label={t.contactForm.industry} name="industry" defaultValue={values.industry} options={INDUSTRIES} />
        </div>

        {/* Row 3: Stage / Time zone / Local time there / Language (Language isn't part of the
            requested 3rd row, but it's real contact data with nowhere else to live in this
            dialog now that the old bordered sub-card is gone, so it rides along here.) */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          {timeZone ? (
            <div className="flex flex-col justify-end">
              <LocalTimeCard timeZone={timeZone} hour12={hour12} lang={lang} label={t.contactForm.timeZoneNow} />
            </div>
          ) : (
            <div />
          )}
          <div>
            <label className={LABEL_CLASS}>{t.contactForm.language}</label>
            <div className="mt-2 flex items-center gap-4 text-sm text-ink lg:flex-col lg:items-start lg:gap-1.5">
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
        </div>

        {/* Row 4: Website (+ Tags below it) / Nickname (+ Project goal below) /
            Birthday (+ Services required below) / Image */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <Field label={t.contactForm.website} name="website" type="url" defaultValue={values.website} placeholder="https://…" />
            <TagManager contactId={contactId} tags={tags} allTags={allTags} lang={lang} />
          </div>
          <div className="space-y-3">
            <Field label={t.contactForm.nickname} name="nickname" defaultValue={values.nickname} />
            <div>
              <label className={LABEL_CLASS}>{t.contactDetail.projectGoalLabel}</label>
              <input type="hidden" name="projectGoalDescriptionSlug" value={projectGoal?.fieldSlug ?? PROJECT_GOAL_DEFAULT_SLUG} />
              <textarea name="projectGoalDescription" rows={3} defaultValue={projectGoal?.value ?? ""} className={FIELD_CLASS} />
            </div>
          </div>
          <div className="space-y-3">
            <Field label={t.contactForm.birthday} name="birthday" type="date" defaultValue={values.birthday} placeholder="YYYY-MM-DD" />
            <div>
              <label className={LABEL_CLASS}>{t.contactDetail.servicesRequiredLabel}</label>
              <input type="hidden" name="servicesRequiredSlug" value={servicesRequired?.fieldSlug ?? SERVICES_REQUIRED_DEFAULT_SLUG} />
              <textarea name="servicesRequired" rows={3} defaultValue={servicesRequired?.value ?? ""} className={FIELD_CLASS} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.contactDetail.fieldPhotoLabel}</label>
            <div className="mt-1">
              <AvatarPicker
                name="avatarUrl"
                defaultValue={values.avatarUrl}
                firstName={values.firstName}
                lastName={values.lastName}
                labels={{ upload: t.contactForm.avatarUpload, orChoose: t.contactForm.avatarOrChoose, remove: t.contactForm.avatarRemove }}
              />
            </div>
          </div>
        </div>

        {isManual && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t.contactDetail.fieldSource} name="source" defaultValue={values.source} />
          </div>
        )}
      </SectionDialog>
    </>
  );
}
