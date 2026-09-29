"use client";

import { useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { CONTACT_SYNC_APPS, type ContactSyncDirection } from "@/lib/contact-sync";
import { Field, LABEL_CLASS } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";

export interface OtherInfoValues {
  source?: string | null;
  systemeIoId?: number | null;
  fieldValues?: { fieldSlug: string; value: string | null }[] | null;
  appSyncSettings?: { app: string; enabled: boolean; direction: string }[] | null;
}

export default function OtherInfoDialog({
  action,
  values,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  values: OtherInfoValues;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const isManual = !values.systemeIoId;

  const appSyncDefaults = (app: string): { enabled: boolean; direction: ContactSyncDirection } => {
    const existing = values.appSyncSettings?.find((row) => row.app === app);
    if (existing) return { enabled: existing.enabled, direction: existing.direction as ContactSyncDirection };
    if (app === "google_contacts") return { enabled: true, direction: "BOTH" };
    if (app === "systeme_io") return { enabled: Boolean(values.systemeIoId), direction: "BOTH" };
    return { enabled: false, direction: "BOTH" };
  };
  const [appSync, setAppSync] = useState<Record<string, { enabled: boolean; direction: ContactSyncDirection }>>(() =>
    Object.fromEntries(CONTACT_SYNC_APPS.map((def) => [def.app, appSyncDefaults(def.app)]))
  );

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog open={open} onOpenChange={setOpen} title={t.contactForm.cardOtherInfo} action={action} labels={t.phaseDialog} wide>
      {isManual && <Field label={t.contactDetail.fieldSource} name="source" defaultValue={values.source} />}

      <div className="rounded-lg border border-card-border bg-black/[0.02] p-3">
        <h3 className={LABEL_CLASS}>{t.contactForm.appSyncTitle}</h3>
        <p className="mt-1 text-xs text-soft">{t.contactForm.appSyncHelp}</p>
        <div className="mt-3 space-y-2">
          {CONTACT_SYNC_APPS.map((def) => {
            const current = appSync[def.app];
            return (
              <div key={def.app} className="flex flex-wrap items-center gap-3 rounded-md border border-card-border bg-card-bg px-3 py-2">
                <label className="flex min-w-[10rem] flex-1 items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name={`appSyncEnabled_${def.app}`}
                    checked={current.enabled}
                    onChange={(e) => setAppSync((prev) => ({ ...prev, [def.app]: { ...prev[def.app], enabled: e.target.checked } }))}
                    className="accent-amo-lime"
                  />
                  {t.contactForm.syncAppLabels[def.labelKey as keyof typeof t.contactForm.syncAppLabels] ?? def.app}
                </label>
                <select
                  name={`appSyncDirection_${def.app}`}
                  value={current.direction}
                  onChange={(e) => setAppSync((prev) => ({ ...prev, [def.app]: { ...prev[def.app], direction: e.target.value as ContactSyncDirection } }))}
                  disabled={!current.enabled}
                  className="rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm disabled:opacity-50"
                >
                  <option value="BOTH">{t.contactForm.syncDirectionBoth}</option>
                  <option value="TO_APP">{t.contactForm.syncDirectionToApp}</option>
                  <option value="FROM_APP">{t.contactForm.syncDirectionFromApp}</option>
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </SectionDialog>

  </>
  );
}
