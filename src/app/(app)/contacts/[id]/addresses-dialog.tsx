"use client";

import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { countryToCode } from "@/lib/country-flag";
import PhoneField from "@/components/phone-field";
import { AddressGroup, Field, type ExtraAddress } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";
import { CARD_COLORS } from "@/components/section-card";

export interface AddressesValues {
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
}

export default function AddressesDialog({
  action,
  values,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  values: AddressesValues;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const billingPhoneCountry = countryToCode(values.billingCountry) ?? "CA";
  const [extraAddresses, setExtraAddresses] = useState(() => (values.extraAddresses ?? []).map((row, id) => ({ id, ...row })));
  const nextId = useRef(extraAddresses.length);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog
      open={open}
      onOpenChange={setOpen}
      title={t.contactForm.cardAddresses}
      action={action}
      labels={t.phaseDialog}
      wide
      headerColorClassName={CARD_COLORS.addresses}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <AddressGroup title={t.contactForm.mainAddressTitle} prefix="" t={t} lang={lang} values={values} />
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
                { id: nextId.current++, description: "", address: "", city: "", state: "", zip: "", country: "Canada" },
              ])
            }
            className="text-xs font-semibold text-amo-lime hover:underline"
          >
            + {t.contactForm.addAddress}
          </button>
        </div>
        <div className="self-start">
          <AddressGroup title={t.contactForm.billingAddressTitle} prefix="billing" t={t} lang={lang} values={values} stacked>
            <Field label={t.contactForm.billingContactName} name="billingContactName" defaultValue={values.billingContactName} />
            <PhoneField name="billingPhone" label={t.contactForm.billingPhone} defaultCountry={billingPhoneCountry} defaultValue={values.billingPhone} />
            <Field label={t.contactForm.billingEmail} name="billingEmail" type="email" defaultValue={values.billingEmail} />
          </AddressGroup>
        </div>
      </div>
    </SectionDialog>

  </>
  );
}
