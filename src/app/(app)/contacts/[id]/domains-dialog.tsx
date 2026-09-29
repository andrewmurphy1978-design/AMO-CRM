"use client";

import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { TABLE_INPUT_CLASS, type DomainRow } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";

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
    <SectionDialog open={open} onOpenChange={setOpen} title={t.contactForm.cardDomains} action={action} labels={t.phaseDialog} wide>
      <div className="overflow-x-auto rounded-lg border border-card-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border bg-black/[0.02] text-left text-xs uppercase tracking-wide text-soft">
              <th className="px-3 py-2 font-semibold">{t.contactForm.domain}</th>
              <th className="px-3 py-2 font-semibold">{t.contactForm.registrar}</th>
              <th className="px-3 py-2 font-semibold">{t.contactForm.dnsProvider}</th>
              <th className="px-3 py-2 font-semibold">{t.contactForm.expiryDate}</th>
              <th className="px-3 py-2 font-semibold">{t.contactForm.autoRenew}</th>
              <th className="px-3 py-2 font-semibold">{t.contactForm.managedBy}</th>
              <th className="px-3 py-2 font-semibold">{t.contactForm.notes}</th>
              <th className="px-3 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {domains.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  <input name="domainDomain" defaultValue={row.domain} placeholder="example.com" className={TABLE_INPUT_CLASS} />
                </td>
                <td className="px-3 py-2">
                  <input name="domainRegistrar" defaultValue={row.registrar ?? ""} className={TABLE_INPUT_CLASS} />
                </td>
                <td className="px-3 py-2">
                  <input name="domainDnsProvider" defaultValue={row.dnsProvider ?? ""} className={TABLE_INPUT_CLASS} />
                </td>
                <td className="px-3 py-2">
                  <input type="date" name="domainExpiryDate" defaultValue={row.expiryDate ?? ""} className={TABLE_INPUT_CLASS} />
                </td>
                <td className="px-3 py-2">
                  <select name="domainAutoRenew" defaultValue={row.autoRenew ? "on" : "off"} className={TABLE_INPUT_CLASS}>
                    <option value="off">{t.contactForm.no}</option>
                    <option value="on">{t.contactForm.yes}</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input name="domainManagedBy" defaultValue={row.managedBy ?? ""} className={TABLE_INPUT_CLASS} />
                </td>
                <td className="px-3 py-2">
                  <input name="domainNotes" defaultValue={row.notes ?? ""} className={TABLE_INPUT_CLASS} />
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setDomains((rows) => rows.filter((r) => r.id !== row.id))}
                    className="shrink-0 rounded-md border border-card-border px-2 py-1.5 text-xs text-soft hover:text-ink"
                    aria-label={t.contactForm.removeEntry}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
