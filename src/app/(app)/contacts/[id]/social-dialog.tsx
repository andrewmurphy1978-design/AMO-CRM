"use client";

import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { AppSelect, FIELD_CLASS, SOCIAL_PLATFORMS } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";

export default function SocialDialog({
  action,
  socialLinks: initialLinks,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  socialLinks: { platform: string; url: string }[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const [socialLinks, setSocialLinks] = useState(() => initialLinks.map((link, id) => ({ id, ...link })));
  const nextId = useRef(socialLinks.length);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog open={open} onOpenChange={setOpen} title={t.contactForm.cardSocialMedia} action={action} labels={t.phaseDialog}>
      <div className="space-y-1.5">
        {socialLinks.map((row) => (
          <div key={row.id} className="flex items-center gap-1.5">
            <AppSelect
              name="socialPlatform"
              value={row.platform}
              onChange={(platform) => setSocialLinks((rows) => rows.map((r) => (r.id === row.id ? { ...r, platform } : r)))}
              options={SOCIAL_PLATFORMS}
            />
            <input type="url" name="socialUrl" defaultValue={row.url} placeholder="https://…" className={`${FIELD_CLASS} mt-0 flex-1`} />
            <button
              type="button"
              onClick={() => setSocialLinks((rows) => rows.filter((r) => r.id !== row.id))}
              className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
              aria-label={t.contactForm.removeEntry}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSocialLinks((rows) => [...rows, { id: nextId.current++, platform: SOCIAL_PLATFORMS[0], url: "" }])}
          className="text-xs font-semibold text-amo-lime hover:underline"
        >
          + {t.contactForm.addSocialLink}
        </button>
      </div>
    </SectionDialog>

  </>
  );
}
