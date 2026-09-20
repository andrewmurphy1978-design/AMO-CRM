"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createServicePriceListItem,
  updateServicePriceListItem,
  deleteServicePriceListItem,
} from "@/actions/service-price-list";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

type ServiceItem = {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number;
  currency: string;
  unit: string | null;
  active: boolean;
};

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

export default function ServicePriceListForm({ items, lang }: { items: ServiceItem[]; lang: Lang }) {
  const [selected, setSelected] = useState<ServiceItem | null>(null);
  const [mode, setMode] = useState<"none" | "create" | "edit">("none");
  const [deletePending, startDeleteTransition] = useTransition();
  const t = getDict(lang);

  const [createState, createAction, createPending] = useActionState(createServicePriceListItem, undefined);
  const [updateState, updateAction, updatePending] = useActionState(updateServicePriceListItem, undefined);

  function openCreate() {
    setSelected(null);
    setMode("create");
  }

  function openEdit(item: ServiceItem) {
    setSelected(item);
    setMode("edit");
  }

  function closeForm() {
    setSelected(null);
    setMode("none");
  }

  function handleDelete() {
    if (!selected) return;
    if (!confirm(t.servicePriceList.deleteConfirm)) return;
    startDeleteTransition(() => deleteServicePriceListItem(selected.id));
    closeForm();
  }

  const activeState = mode === "create" ? createState : updateState;
  const activePending = mode === "create" ? createPending : updatePending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">{t.servicePriceList.title}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-[#0fa38a] px-3 py-1.5 text-xs font-medium text-[#f4faf6] hover:opacity-90"
          >
            {t.servicePriceList.add}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!selected || deletePending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-30"
          >
            {t.common.delete}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-card-border rounded-md border border-card-border">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => openEdit(item)}
              className={`w-full px-3 py-2 text-left transition-colors ${
                selected?.id === item.id ? "bg-amo-lime/10" : "hover:bg-field-bg"
              }`}
            >
              <p className={`text-sm font-medium ${item.active ? "text-ink" : "text-soft line-through"}`}>{item.name}</p>
              <p className="text-xs text-soft">
                {item.unitPrice.toFixed(2)} {item.currency}
                {item.unit && ` / ${item.unit}`}
              </p>
            </button>
          </li>
        ))}
        {items.length === 0 && <p className="px-3 py-4 text-sm text-soft">{t.servicePriceList.noItems}</p>}
      </ul>

      {mode !== "none" && (
        <form
          key={selected?.id ?? "new"}
          action={mode === "create" ? createAction : updateAction}
          className="grid gap-3 border-t border-card-border pt-4 sm:grid-cols-2"
        >
          {mode === "edit" && selected && <input type="hidden" name="itemId" value={selected.id} />}
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>{t.servicePriceList.name}</label>
            <input name="name" required defaultValue={selected?.name} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.servicePriceList.unitPrice}</label>
            <input
              name="unitPrice"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={selected?.unitPrice ?? 0}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.servicePriceList.currency}</label>
            <select name="currency" defaultValue={selected?.currency ?? "CAD"} className={FIELD_CLASS}>
              <option value="CAD">CAD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.servicePriceList.unit}</label>
            <input
              name="unit"
              placeholder={t.servicePriceList.unitPlaceholder}
              defaultValue={selected?.unit ?? ""}
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="active" defaultChecked={selected?.active ?? true} className="accent-amo-lime" />
              {t.servicePriceList.active}
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>{t.servicePriceList.description}</label>
            <textarea name="description" rows={2} defaultValue={selected?.description ?? ""} className={FIELD_CLASS} />
          </div>

          <div className="sm:col-span-2 flex items-center gap-3">
            {activeState?.error && <p className="text-sm text-red-600">{activeState.error}</p>}
            {activeState?.success && <p className="text-sm text-emerald-700">{activeState.success}</p>}
          </div>

          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={activePending}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
            >
              {activePending ? t.common.saving : t.common.save}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
