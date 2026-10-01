"use client";

import { useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { CARD_COLORS } from "@/components/section-card";
import SectionDialog, { EditCardButton } from "./section-dialog";

// Free-text background about the contact, written for an AI assistant.
export default function AiDetailsDialog({
  action,
  value,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  value: string;
  lang: Lang;
}) {
  const t = getDict(lang);
  const fr = lang === "fr";
  const [open, setOpen] = useState(false);
  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
      <SectionDialog
        open={open}
        onOpenChange={setOpen}
        title={fr ? "Détails du contact pour l'IA" : "Contact details for AI"}
        action={action}
        labels={t.phaseDialog}
        wide
        headerColorClassName={CARD_COLORS.aiDetails}
      >
        <p className="mb-2 text-xs text-soft">
          {fr
            ? "Écrivez tout ce qu'une IA devrait savoir sur ce contact : qui il est, son entreprise, ses objectifs, ses préférences, le ton à utiliser, les sujets à éviter…"
            : "Write anything an AI should know about this contact: who they are, their business, goals, preferences, the tone to use, topics to avoid…"}
        </p>
        <textarea
          name="aiDetails"
          rows={16}
          defaultValue={value}
          className="w-full min-w-0 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </SectionDialog>
    </>
  );
}
