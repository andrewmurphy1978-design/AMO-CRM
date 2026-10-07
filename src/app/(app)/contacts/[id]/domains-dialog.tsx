"use client";

import DateInput from "@/components/date-input";
import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { FIELD_CLASS, LABEL_CLASS, type DomainRow } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";
import { CARD_COLORS } from "@/components/section-card";
import Combobox from "@/components/combobox";

// A desktop "table" built from grid instead of an actual <table>, so the
// same markup can restack to full-width labeled fields on mobile instead of
// forcing a fixed-width table to scroll horizontally (same pattern as
// tech-stack-dialog.tsx). Managed By and Notes get the most extra room
// (the dialog itself is `maxWide` so growing them doesn't come at the
// expense of any other column).
const GRID_COLS = "lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1.8fr)_minmax(0,1.6fr)_2.25rem]";

// Suggestions for the Registrar/DNS Provider comboboxes (see Combobox) —
// still free text underneath, since a client's actual registrar/DNS host
// is very often something not on any fixed list.
const COMMON_REGISTRARS = [
  "GoDaddy",
  "IONOS",
  "Namecheap",
  "Cloudflare",
  "Porkbun",
  "Squarespace",
  "NameSilo",
  "Dynadot",
  "Amazon Route 53",
  "Google Domains",
  "Hover",
  "Name.com",
  "Network Solutions",
  "Gandi",
  "OVHcloud",
  "Bluehost",
  "HostGator",
  "Hostinger",
  "Wix",
  "Domain.com",
  "Register.com",
];
const COMMON_DNS_PROVIDERS = [
  "GoDaddy",
  "Cloudflare",
  "IONOS",
  "Amazon Route 53",
  "Google Cloud DNS",
  "DNSimple",
  "NS1 (IBM)",
  "Dyn/Oracle Cloud",
  "Azure DNS",
  "Akamai",
  "DigitalOcean",
  "Vercel",
  "Netlify",
  "Namecheap",
  "Squarespace",
  "Wix",
  "Hover",
  "Name.com",
  "Gandi",
  "OVHcloud",
  "Bluehost",
  "Hostinger",
];

export default function DomainsDialog({
  action,
  domains: initialDomains,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  domains: DomainRow[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const [domains, setDomains] = useState(() =>
    initialDomains.map((row, id) => ({
      id,
      ...row,
      // See contact-form.tsx's own domains state comment: an RSC-passed
      // DateTime prop arrives as a real Date instance, not an ISO string.
      expiryDate: row.expiryDate
        ? (row.expiryDate instanceof Date ? row.expiryDate.toISOString() : String(row.expiryDate)).slice(0, 10)
        : "",
    }))
  );
  const nextId = useRef(domains.length);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog
      open={open}
      onOpenChange={setOpen}
      title={t.contactForm.cardDomains}
      action={action}
      labels={t.phaseDialog}
      maxWide
      headerColorClassName={CARD_COLORS.domains}
    >
      <div className="divide-y divide-card-border rounded-lg border border-card-border">
        <div className={`hidden border-b border-card-border bg-black/[0.02] px-3 py-2 text-left text-xs uppercase tracking-wide text-soft lg:grid lg:gap-2 ${GRID_COLS}`}>
          {/* Each row's own container is `lg:px-3` and each field's input/
              combobox has its own px-3 on top of that, so the row's text
              sits 24px in from the row's left edge (12 + 12). This header
              row's container is a plain `px-3` (12px) — matching that same
              24px total needs one more 12px of its own, hence `pl-3` on
              every label span. */}
          <span className="pl-3">{t.contactForm.domain}</span>
          <span className="pl-3">{t.contactForm.registrar}</span>
          <span className="pl-3">{t.contactForm.dnsProvider}</span>
          <span className="pl-3">{t.contactForm.expiryDate}</span>
          <span className="pl-3">{t.contactForm.autoRenew}</span>
          <span className="pl-3">{t.contactForm.managedBy}</span>
          <span className="pl-3">{t.contactForm.notes}</span>
          <span></span>
        </div>
        {domains.map((row) => (
          <div key={row.id} className={`grid gap-3 p-3 lg:items-center lg:gap-2 lg:px-3 lg:py-2 ${GRID_COLS}`}>
            <div>
              <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.domain}</label>
              <input name="domainDomain" defaultValue={row.domain} placeholder="example.com" className={`${FIELD_CLASS} lg:mt-0`} />
            </div>
            <Combobox
              label={t.contactForm.registrar}
              labelClassName={`${LABEL_CLASS} lg:hidden`}
              inputClassName={`${FIELD_CLASS} lg:mt-0`}
              name="domainRegistrar"
              defaultValue={row.registrar}
              options={COMMON_REGISTRARS}
            />
            <Combobox
              label={t.contactForm.dnsProvider}
              labelClassName={`${LABEL_CLASS} lg:hidden`}
              inputClassName={`${FIELD_CLASS} lg:mt-0`}
              name="domainDnsProvider"
              defaultValue={row.dnsProvider}
              options={COMMON_DNS_PROVIDERS}
            />
            <div>
              <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.expiryDate}</label>
              <DateInput name="domainExpiryDate" defaultValue={row.expiryDate ?? ""} className={`${FIELD_CLASS} lg:mt-0`} />
            </div>
            <div>
              <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.autoRenew}</label>
              <select name="domainAutoRenew" defaultValue={row.autoRenew ? "on" : "off"} className={`${FIELD_CLASS} lg:mt-0`}>
                <option value="off">{t.contactForm.no}</option>
                <option value="on">{t.contactForm.yes}</option>
              </select>
            </div>
            <div>
              <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.managedBy}</label>
              <input name="domainManagedBy" defaultValue={row.managedBy ?? ""} className={`${FIELD_CLASS} lg:mt-0`} />
            </div>
            <div className="flex items-end gap-1.5">
              <div className="min-w-0 flex-1">
                <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.notes}</label>
                <input name="domainNotes" defaultValue={row.notes ?? ""} className={`${FIELD_CLASS} lg:mt-0`} />
              </div>
              <button
                type="button"
                onClick={() => setDomains((rows) => rows.filter((r) => r.id !== row.id))}
                className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink lg:hidden"
                aria-label={t.contactForm.removeEntry}
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDomains((rows) => rows.filter((r) => r.id !== row.id))}
              className="hidden w-full shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink lg:block"
              aria-label={t.contactForm.removeEntry}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          setDomains((rows) => [
            ...rows,
            { id: nextId.current++, domain: "", registrar: "", dnsProvider: "", expiryDate: "", autoRenew: false, managedBy: "", notes: "" },
          ])
        }
        className="text-xs font-semibold text-amo-lime hover:underline"
      >
        + {t.contactForm.addDomain}
      </button>
    </SectionDialog>

  </>
  );
}
