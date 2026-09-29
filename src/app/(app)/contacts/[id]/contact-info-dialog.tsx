"use client";

import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { countryToCode } from "@/lib/country-flag";
import { MESSAGING_APPS } from "@/lib/platform-icons";
import PhoneField from "@/components/phone-field";
import { AppHandleList, FIELD_CLASS, LABEL_CLASS, type AppHandleRow } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";

export interface ContactInfoValues {
  email?: string | null;
  email2?: string | null;
  extraEmails?: string[] | null;
  phone?: string | null;
  phone2?: string | null;
  extraPhones?: string[] | null;
  country?: string | null;
  messagingAccounts?: AppHandleRow[] | null;
}

export default function ContactInfoDialog({
  action,
  values,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  values: ContactInfoValues;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const phoneCountry = countryToCode(values.country) ?? "CA";

  const [extraEmails, setExtraEmails] = useState(() => (values.extraEmails ?? []).map((value, id) => ({ id, value })));
  const nextEmailId = useRef(extraEmails.length);
  const [extraPhones, setExtraPhones] = useState(() => (values.extraPhones ?? []).map((value, id) => ({ id, value })));
  const nextPhoneId = useRef(extraPhones.length);
  const [messagingAccounts, setMessagingAccounts] = useState(() => (values.messagingAccounts ?? []).map((row, id) => ({ id, ...row })));
  const nextMessagingId = useRef(messagingAccounts.length);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog open={open} onOpenChange={setOpen} title={t.contactForm.cardContactInfo} action={action} labels={t.phaseDialog} wide>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.7fr)_minmax(0,1.9fr)]">
        <div>
          <label className={LABEL_CLASS}>{t.contactForm.emails}</label>
          <div className="mt-1 space-y-1.5">
            <input type="email" name="email" defaultValue={values.email ?? ""} aria-label={t.contactForm.email} className={`${FIELD_CLASS} mt-0`} />
            <input type="email" name="email2" defaultValue={values.email2 ?? ""} aria-label={t.contactForm.email2} className={`${FIELD_CLASS} mt-0`} />
            {extraEmails.map((row) => (
              <div key={row.id} className="flex items-center gap-1.5">
                <input type="email" name="extraEmails" defaultValue={row.value} className={`${FIELD_CLASS} mt-0 flex-1`} />
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
            <PhoneField name="phone" label={t.contactForm.phone} defaultCountry={phoneCountry} defaultValue={values.phone} hideLabel />
            <PhoneField name="phone2" label={t.contactForm.phone2} defaultCountry={phoneCountry} defaultValue={values.phone2} hideLabel />
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
    </SectionDialog>

  </>
  );
}
