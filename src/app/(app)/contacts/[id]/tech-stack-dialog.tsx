"use client";

import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { FIELD_CLASS, LABEL_CLASS } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";
import { CARD_COLORS } from "@/components/section-card";

// Grid-cols-[140px_1fr_1fr_1fr] layout at lg (a desktop "table" without an
// actual <table>, so the same markup can restack to one column on mobile
// instead of forcing a fixed-width table to scroll horizontally) — each
// field's own label is shown only below lg, since the header row above
// already labels the desktop columns.
const GRID_COLS = "lg:grid-cols-[140px_1fr_1fr_1fr]";

function TechStackFieldGroup({
  label,
  prefix,
  values,
  appSuffix = "DesignApp",
  t,
}: {
  label: string;
  prefix: "website" | "funnels" | "email" | "store";
  values: TechStackValues;
  appSuffix?: "DesignApp" | "MarketingApp";
  t: ReturnType<typeof getDict>;
}) {
  const field = (suffix: string) => `${prefix}${suffix}` as keyof TechStackValues;
  const get = (suffix: string): string => (values[field(suffix)] as string | null | undefined) ?? "";

  return (
    <div className={`grid gap-3 p-3 lg:items-center lg:gap-2 lg:px-3 lg:py-2 ${GRID_COLS}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-soft">{label}</p>
      <div>
        <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.domain}</label>
        <input name={field("Domain")} defaultValue={get("Domain")} className={`${FIELD_CLASS} lg:mt-0`} />
      </div>
      <div>
        <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.hostingProvider}</label>
        <input name={field("HostingProvider")} defaultValue={get("HostingProvider")} className={`${FIELD_CLASS} lg:mt-0`} />
      </div>
      <div>
        <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.appColumn}</label>
        <input name={field(appSuffix)} defaultValue={get(appSuffix)} className={`${FIELD_CLASS} lg:mt-0`} />
      </div>
    </div>
  );
}

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
    <SectionDialog
      open={open}
      onOpenChange={setOpen}
      title={t.contactForm.techStackTitle}
      action={action}
      labels={t.phaseDialog}
      wide
      headerColorClassName={CARD_COLORS.techStack}
    >
      <div className="divide-y divide-card-border rounded-lg border border-card-border">
        <div className={`hidden border-b border-card-border bg-black/[0.02] px-3 py-2 text-left text-xs uppercase tracking-wide text-soft lg:grid lg:gap-2 ${GRID_COLS}`}>
          <span></span>
          <span>{t.contactForm.domain}</span>
          <span>{t.contactForm.hostingProvider}</span>
          <span>{t.contactForm.appColumn}</span>
        </div>
        <TechStackFieldGroup label={t.contactForm.websiteGroupTitle} prefix="website" values={values} t={t} />
        <TechStackFieldGroup label={t.contactForm.funnelsGroupTitle} prefix="funnels" values={values} t={t} />
        <TechStackFieldGroup label={t.contactForm.emailGroupTitle} prefix="email" values={values} appSuffix="MarketingApp" t={t} />
        <TechStackFieldGroup label={t.contactForm.storeGroupTitle} prefix="store" values={values} t={t} />
        {techStackItems.map((row) => (
          <div key={row.id} className={`grid gap-3 p-3 lg:items-center lg:gap-2 lg:px-3 lg:py-2 ${GRID_COLS}`}>
            <input
              name="techStackLabel"
              defaultValue={row.label}
              placeholder={t.contactForm.techStackLabelPlaceholder}
              className={`${FIELD_CLASS} lg:mt-0`}
            />
            <div>
              <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.domain}</label>
              <input name="techStackDomain" defaultValue={row.domain ?? ""} className={`${FIELD_CLASS} lg:mt-0`} />
            </div>
            <div>
              <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.hostingProvider}</label>
              <input name="techStackHostingProvider" defaultValue={row.hostingProvider ?? ""} className={`${FIELD_CLASS} lg:mt-0`} />
            </div>
            <div className="flex items-end gap-1.5">
              <div className="min-w-0 flex-1">
                <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.appColumn}</label>
                <input name="techStackApp" defaultValue={row.app ?? ""} className={`${FIELD_CLASS} lg:mt-0`} />
              </div>
              <button
                type="button"
                onClick={() => setTechStackItems((rows) => rows.filter((r) => r.id !== row.id))}
                className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
                aria-label={t.contactForm.removeEntry}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
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
