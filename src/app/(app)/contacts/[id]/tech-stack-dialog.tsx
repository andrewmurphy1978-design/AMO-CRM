"use client";

import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { TechStackRow, TABLE_INPUT_CLASS } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";

export interface TechStackValues {
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
}

export default function TechStackDialog({
  action,
  values,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  values: TechStackValues;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const [techStackItems, setTechStackItems] = useState(() => (values.techStackItems ?? []).map((row, id) => ({ id, ...row })));
  const nextId = useRef(techStackItems.length);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog open={open} onOpenChange={setOpen} title={t.contactForm.techStackTitle} action={action} labels={t.phaseDialog} wide>
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
            <TechStackRow label={t.contactForm.websiteGroupTitle} prefix="website" values={values} />
            <TechStackRow label={t.contactForm.funnelsGroupTitle} prefix="funnels" values={values} />
            <TechStackRow label={t.contactForm.emailGroupTitle} prefix="email" values={values} appSuffix="MarketingApp" />
            <TechStackRow label={t.contactForm.storeGroupTitle} prefix="store" values={values} />
            {techStackItems.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  <input name="techStackLabel" defaultValue={row.label} placeholder={t.contactForm.techStackLabelPlaceholder} className={TABLE_INPUT_CLASS} />
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
        onClick={() => setTechStackItems((rows) => [...rows, { id: nextId.current++, label: "", domain: "", hostingProvider: "", app: "" }])}
        className="text-xs font-semibold text-amo-lime hover:underline"
      >
        + {t.contactForm.addTechStackRow}
      </button>
    </SectionDialog>

  </>
  );
}
