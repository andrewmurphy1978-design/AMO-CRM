"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { computeBillingTotals } from "@/lib/billing-totals";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

type LineItemRow = { tempKey: number; description: string; quantity: number; unitPrice: number };

type InvoiceFormValues = {
  number?: string | null;
  currency?: string;
  dueDate?: Date | string | null;
  notes?: string | null;
  lineItems?: { description: string; quantity: number; unitPrice: number }[];
};

type CatalogItem = { id: string; name: string; description: string | null; unitPrice: number; currency: string; unit: string | null };

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

function toDateInput(value?: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function InvoiceLineItemsForm({
  action,
  defaultValues,
  catalog,
  taxLocation,
  chargeCanadianTax,
  lang,
}: {
  action: (
    prevState: { error?: string; success?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string }>;
  defaultValues?: InvoiceFormValues;
  catalog: CatalogItem[];
  taxLocation: { country: string | null; province: string | null };
  chargeCanadianTax: boolean;
  lang: Lang;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = getDict(lang);

  const [lineItems, setLineItems] = useState<LineItemRow[]>(() =>
    (defaultValues?.lineItems ?? []).map((li, tempKey) => ({ tempKey, ...li }))
  );
  const nextLineKey = useRef(lineItems.length);
  const [currency, setCurrency] = useState(defaultValues?.currency ?? "CAD");

  const totals = useMemo(
    () => computeBillingTotals(lineItems, taxLocation, chargeCanadianTax),
    [lineItems, taxLocation, chargeCanadianTax]
  );

  function addLineItem(preset?: { description: string; unitPrice: number }) {
    setLineItems((rows) => [
      ...rows,
      { tempKey: nextLineKey.current++, description: preset?.description ?? "", quantity: 1, unitPrice: preset?.unitPrice ?? 0 },
    ]);
  }

  function updateLineItem(tempKey: number, patch: Partial<LineItemRow>) {
    setLineItems((rows) => rows.map((r) => (r.tempKey === tempKey ? { ...r, ...patch } : r)));
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL_CLASS}>{t.invoices.number}</label>
          <input name="number" defaultValue={defaultValues?.number ?? ""} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.invoices.currency}</label>
          <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={FIELD_CLASS}>
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.invoices.dueDate}</label>
          <input type="date" name="dueDate" defaultValue={toDateInput(defaultValues?.dueDate)} className={FIELD_CLASS} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className={LABEL_CLASS}>{t.invoices.lineItemsTitle}</label>
          {catalog.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                const item = catalog.find((c) => c.id === e.target.value);
                if (item) addLineItem({ description: item.name, unitPrice: item.unitPrice });
                e.target.value = "";
              }}
              className="rounded-md border border-card-border bg-field-bg px-2 py-1 text-xs text-ink"
            >
              <option value="" disabled>
                {t.invoices.pickFromPriceList}
              </option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.unitPrice} {c.currency})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mt-2 space-y-2">
          {lineItems.map((row) => (
            <div key={row.tempKey} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="lineItemDescription" value={row.description} />
              <input type="hidden" name="lineItemQuantity" value={row.quantity} />
              <input type="hidden" name="lineItemUnitPrice" value={row.unitPrice} />
              <input
                value={row.description}
                onChange={(e) => updateLineItem(row.tempKey, { description: e.target.value })}
                placeholder={t.invoices.description}
                className={`${FIELD_CLASS} mt-0 min-w-[10rem] flex-1`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.quantity}
                onChange={(e) => updateLineItem(row.tempKey, { quantity: Number(e.target.value) })}
                placeholder={t.invoices.quantity}
                className={`${FIELD_CLASS} mt-0 w-20`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.unitPrice}
                onChange={(e) => updateLineItem(row.tempKey, { unitPrice: Number(e.target.value) })}
                placeholder={t.invoices.unitPrice}
                className={`${FIELD_CLASS} mt-0 w-28`}
              />
              <span className="w-24 text-right text-sm text-soft">{(row.quantity * row.unitPrice).toFixed(2)}</span>
              <button
                type="button"
                onClick={() => setLineItems((rows) => rows.filter((r) => r.tempKey !== row.tempKey))}
                className="rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
              >
                ✕
              </button>
            </div>
          ))}
          {lineItems.length === 0 && <p className="text-sm text-soft">{t.invoices.noLineItems}</p>}
          <button type="button" onClick={() => addLineItem()} className="text-xs font-semibold text-amo-lime hover:underline">
            + {t.invoices.addLineItem}
          </button>
        </div>

        <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-soft">{t.invoices.subtotal}</span>
            <span className="text-ink">
              {totals.subtotal.toFixed(2)} {currency}
            </span>
          </div>
          {totals.gst > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.invoices.gst}</span>
              <span className="text-ink">
                {totals.gst.toFixed(2)} {currency}
              </span>
            </div>
          )}
          {totals.qst > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.invoices.qst}</span>
              <span className="text-ink">
                {totals.qst.toFixed(2)} {currency}
              </span>
            </div>
          )}
          {totals.hst > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.invoices.hst}</span>
              <span className="text-ink">
                {totals.hst.toFixed(2)} {currency}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-card-border pt-1 font-semibold">
            <span className="text-ink">{t.invoices.totalDue}</span>
            <span className="text-ink">
              {totals.totalAmount.toFixed(2)} {currency}
            </span>
          </div>
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS}>{t.proposals.notes}</label>
        <textarea name="notes" rows={2} defaultValue={defaultValues?.notes ?? ""} className={FIELD_CLASS} />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.common.saving : t.invoices.saveChanges}
      </button>
    </form>
  );
}
