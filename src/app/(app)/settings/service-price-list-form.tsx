"use client";

import { useState, useTransition } from "react";
import { createServicePriceListItem, updateServicePriceListItem, deleteServicePriceListItem } from "@/actions/service-price-list";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { CARD_COLORS } from "@/components/section-card";
import { PROJECT_TYPE_ORDER } from "@/lib/project-templates";
import SectionDialog from "../contacts/[id]/section-dialog";

type ServiceItem = {
  id: string;
  name: string;
  description: string | null;
  clientDescription: string | null;
  projectType: string | null;
  unitPrice: number;
  currency: string;
  unit: string | null;
  active: boolean;
};

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

// One dialog for both Add and Edit (Delete lives in its header when editing).
function ServiceDialog({ item, lang, onClose }: { item: ServiceItem | null; lang: Lang; onClose: () => void }) {
  const t = getDict(lang);
  const [deleting, startDelete] = useTransition();

  return (
    <SectionDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={item ? item.name : t.servicePriceList.add}
      action={item ? updateServicePriceListItem : createServicePriceListItem}
      labels={t.phaseDialog}
      wide
      headerColorClassName={CARD_COLORS.general}
      headerExtra={
        item ? (
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              if (!confirm(t.servicePriceList.deleteConfirm)) return;
              startDelete(async () => {
                await deleteServicePriceListItem(item.id);
                onClose();
              });
            }}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {t.common.delete}
          </button>
        ) : undefined
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {item && <input type="hidden" name="itemId" value={item.id} />}
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>{t.servicePriceList.name}</label>
          <input name="name" required defaultValue={item?.name} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.servicePriceList.unitPrice}</label>
          <input name="unitPrice" type="number" step="0.01" min="0" required defaultValue={item?.unitPrice ?? 0} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.servicePriceList.currency}</label>
          <select name="currency" defaultValue={item?.currency ?? "CAD"} className={FIELD_CLASS}>
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.servicePriceList.unit}</label>
          <input name="unit" placeholder={t.servicePriceList.unitPlaceholder} defaultValue={item?.unit ?? ""} className={FIELD_CLASS} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="accent-amo-lime" />
            {t.servicePriceList.active}
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>{lang === "fr" ? "Type de projet" : "Project type"}</label>
          <select name="projectType" defaultValue={item?.projectType ?? ""} className={FIELD_CLASS}>
            <option value="">{lang === "fr" ? "— Général —" : "— General —"}</option>
            {PROJECT_TYPE_ORDER.map((tp) => (
              <option key={tp} value={tp}>
                {t.projectTypes[tp as keyof typeof t.projectTypes]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-soft">
            {lang === "fr" ? "Dans une proposition, les services du type du projet sont proposés en premier." : "In a proposal, the services for the project's type are offered first."}
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>{lang === "fr" ? "Description pour le client (affichée sous la ligne)" : "Client description (shown under the line)"}</label>
          <textarea name="clientDescription" rows={3} defaultValue={item?.clientDescription ?? ""} className={FIELD_CLASS} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>{lang === "fr" ? "Note interne (fourchette de prix, etc.)" : "Internal note (price range, etc.)"}</label>
          <textarea name="description" rows={2} defaultValue={item?.description ?? ""} className={FIELD_CLASS} />
        </div>
      </div>
    </SectionDialog>
  );
}

export default function ServicePriceListForm({ items, lang }: { items: ServiceItem[]; lang: Lang }) {
  // `null` = closed; { item: null } = adding; { item } = editing.
  const [dialog, setDialog] = useState<{ item: ServiceItem | null; key: number } | null>(null);
  const [counter, setCounter] = useState(0);
  const t = getDict(lang);

  function open(item: ServiceItem | null) {
    setCounter((c) => c + 1);
    setDialog({ item, key: counter + 1 });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">{t.servicePriceList.title}</h2>
        <button type="button" onClick={() => open(null)} className="rounded-md bg-[#0fa38a] px-3 py-1.5 text-xs font-medium text-[#f4faf6] hover:opacity-90">
          {t.servicePriceList.add}
        </button>
      </div>

      <ul className="divide-y divide-card-border rounded-md border border-card-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className={`truncate text-sm font-medium ${item.active ? "text-ink" : "text-soft line-through"}`}>{item.name}</p>
              <p className="text-xs text-soft">
                {item.unitPrice.toFixed(2)} {item.currency}
                {item.unit && ` / ${item.unit}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => open(item)}
              className="shrink-0 rounded-md border border-card-border px-3 py-1 text-xs font-medium text-ink hover:bg-black/5"
            >
              {t.contactDetail.edit}
            </button>
          </li>
        ))}
        {items.length === 0 && <p className="px-3 py-4 text-sm text-soft">{t.servicePriceList.noItems}</p>}
      </ul>

      {dialog && <ServiceDialog key={dialog.key} item={dialog.item} lang={lang} onClose={() => setDialog(null)} />}
    </div>
  );
}
