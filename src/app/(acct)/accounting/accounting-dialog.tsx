"use client";

import type { ReactNode } from "react";
import SectionDialog from "@/app/(app)/contacts/[id]/section-dialog";
import { CARD_COLORS, type CardColor } from "@/components/section-card";

type Action = (prev: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;

// The CRM's shared dialog (coloured header bar with Cancel / Save in it) for every Accounting add / edit form.
export default function AccountingDialog({
  open,
  onOpenChange,
  title,
  action,
  lang,
  color,
  saveLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  action: Action;
  lang: "en" | "fr";
  color: CardColor;
  saveLabel?: string;
  children: ReactNode;
}) {
  const fr = lang === "fr";
  return (
    <SectionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      action={action}
      wide
      headerColorClassName={CARD_COLORS[color]}
      labels={{ cancel: fr ? "Annuler" : "Cancel", save: saveLabel ?? (fr ? "Enregistrer" : "Save"), saving: fr ? "Enregistrement…" : "Saving…" }}
    >
      {children}
    </SectionDialog>
  );
}
