"use client";

import { useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { CARD_COLORS } from "@/components/section-card";
import type { FieldTpl, FieldValues } from "@/lib/project-templates";
import SectionDialog, { EditCardButton } from "../../contacts/[id]/section-dialog";
import CustomFieldsInputs from "../custom-fields-inputs";

// Edits the answers to the project type's custom fields. Phases and tasks
// that were already generated are not touched.
export default function ProjectDetailsDialog({
  action,
  fields,
  values,
  type,
  title,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  fields: FieldTpl[];
  values: FieldValues;
  type: string;
  title: string;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
      <SectionDialog open={open} onOpenChange={setOpen} title={title} action={action} labels={t.phaseDialog} wide headerColorClassName={CARD_COLORS.general}>
        <CustomFieldsInputs fields={fields} initial={values} lang={lang} prefix={`${type}__`} />
      </SectionDialog>
    </>
  );
}
