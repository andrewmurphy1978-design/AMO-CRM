"use client";

import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { FIELD_CLASS, LABEL_CLASS, type DomainRow } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";
import { CARD_COLORS } from "@/components/section-card";

// A desktop "table" built from grid instead of an actual <table>, so the
// same markup can restack to full-width labeled fields on mobile instead of
// forcing a fixed-width table to scroll horizontally (same pattern as
// tech-stack-dialog.tsx). Domain/Registrar/DNS Provider get the most room
// since that's where the longest values land.
const GRID_COLS = "lg:grid-cols-[2fr_1.4fr_1.4fr_0.9fr_0.8fr_1.3fr_1.1fr_auto]";

// Suggestions for the Registrar/DNS Provider fields — plain <input>s with a
// <datalist> rather than a <select>, since a client's actual registrar/DNS
// host is very often something not on any fixed list (a reseller, a niche
// host, etc) and free text must always stay possible.
const COMMON_REGISTRARS = [
  "GoDaddy",
  "Namecheap",
  "IONOS",
  "Google Domains",
  "Cloudflare Registrar",
  "Network Solutions",
  "Bluehost",
  "Hover",
  "Domain.com",
  "OVHcloud",
  "Gandi",
  "Squarespace Domains",
  "Wix",
  "1&1",
  "Dynadot",
  "Porkbun",
  "Name.com",
  "Tucows",
];
const COMMON_DNS_PROVIDERS = [
  "Cloudflare",
  "GoDaddy",
  "IONOS",
  "Amazon Route 53",
  "Google Cloud DNS",
  "Namecheap",
  "DNS Made Easy",
  "NS1",
  "Azure DNS",
  "OVHcloud",
  "DigitalOcean",
  "Vercel",
  "Netlify",
  "Squarespace",
  "Hurricane Electric",
  "No-IP",
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
      extraWide
      headerColorClassName={CARD_COLORS.domains}
    >
      <div className="divide-y divide-card-border rounded-lg border border-card-border">
        <div className={`hidden border-b border-card-border bg-black/[0.02] py-2 text-left text-xs uppercase tracking-wide text-soft lg:grid lg:gap-2 ${GRID_COLS}`}>
          {/* pl-3 (not the row's own px-3) lines each label up with the text
              inside the input box below it, which is itself indented by the
              input's own px-3 padding — aligning to the box edge instead
              would leave the label looking shifted left of its field. */}
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
            <div>
              <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.registrar}</label>
              <input
                name="domainRegistrar"
                list="domainRegistrarOptions"
                defaultValue={row.registrar ?? ""}
                className={`${FIELD_CLASS} lg:mt-0`}
              />
            </div>
            <div>
              <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.dnsProvider}</label>
              <input
                name="domainDnsProvider"
                list="domainDnsProviderOptions"
                defaultValue={row.dnsProvider ?? ""}
                className={`${FIELD_CLASS} lg:mt-0`}
              />
            </div>
            <div>
              <label className={`${LABEL_CLASS} lg:hidden`}>{t.contactForm.expiryDate}</label>
              <input type="date" name="domainExpiryDate" defaultValue={row.expiryDate ?? ""} className={`${FIELD_CLASS} lg:mt-0`} />
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
              className="hidden shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink lg:block"
              aria-label={t.contactForm.removeEntry}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <datalist id="domainRegistrarOptions">
        {COMMON_REGISTRARS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="domainDnsProviderOptions">
        {COMMON_DNS_PROVIDERS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
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
