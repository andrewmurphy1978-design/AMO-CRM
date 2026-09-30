"use client";

import { useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { CARD_COLORS } from "@/components/section-card";
import SectionDialog, { EditCardButton } from "../../contacts/[id]/section-dialog";

const FIELD_CLASS =
  "mt-1 w-full min-w-0 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

export interface ProjectGeneralValues {
  name: string;
  status: string;
  type: string;
  contactId: string;
  ownerId: string;
  supervisorId: string;
  teamMemberIds: string[];
  startDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
}

// The project page's General Info card dialog: name, status, type, client,
// owner, supervisor, team, start and due dates. Phases and notes have their
// own cards and dialogs.
export default function ProjectGeneralDialog({
  action,
  values,
  contacts,
  users,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  values: ProjectGeneralValues;
  contacts: { id: string; label: string }[];
  users: { id: string; name: string }[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
      <SectionDialog
        open={open}
        onOpenChange={setOpen}
        title={t.contactForm.cardGeneralInfo}
        action={action}
        labels={t.phaseDialog}
        wide
        headerColorClassName={CARD_COLORS.general}
      >
        <div>
          <label className={LABEL_CLASS}>{t.projectForm.projectName}</label>
          <input name="name" defaultValue={values.name} required className={FIELD_CLASS} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL_CLASS}>{t.projectForm.status}</label>
            <select name="status" defaultValue={values.status} className={FIELD_CLASS}>
              {Object.entries(t.projectStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.projectForm.type}</label>
            <select name="type" defaultValue={values.type} className={FIELD_CLASS}>
              {Object.entries(t.projectTypes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.projectForm.client}</label>
            <select name="contactId" defaultValue={values.contactId} required className={FIELD_CLASS}>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>{t.projectForm.owner}</label>
            <select name="ownerId" defaultValue={values.ownerId} className={FIELD_CLASS}>
              <option value="">{t.common.unassigned}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.projectForm.supervisor}</label>
            <select name="supervisorId" defaultValue={values.supervisorId} className={FIELD_CLASS}>
              <option value="">{t.common.unassigned}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className={LABEL_CLASS}>{t.projectForm.teamMembers}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-card-border bg-field-bg p-3">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-1.5 text-sm text-ink">
                <input
                  type="checkbox"
                  name="teamMemberIds"
                  value={u.id}
                  defaultChecked={values.teamMemberIds.includes(u.id)}
                  className="h-4 w-4 rounded border-card-border accent-amo-lime"
                />
                {u.name}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>{t.projectForm.startDate}</label>
            <input type="date" name="startDate" defaultValue={values.startDate} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.projectForm.dueDate}</label>
            <input type="date" name="dueDate" defaultValue={values.dueDate} className={FIELD_CLASS} />
          </div>
        </div>
      </SectionDialog>
    </>
  );
}
