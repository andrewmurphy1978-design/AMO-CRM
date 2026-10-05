"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { computeBillingTotals } from "@/lib/billing-totals";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { clientFacingDescription } from "@/lib/catalog-text";
import type { RecipientOption } from "@/lib/contact-address";

type LineItemRow = { tempKey: number; description: string; details: string; quantity: number; unitPrice: number };

type InvoiceFormValues = {
  number?: string | null;
  status?: string;
  currency?: string;
  dueDate?: Date | string | null;
  notes?: string | null;
  recipientContactId?: string | null;
  recipientEmail?: string | null;
  recipientAddress?: string | null;
  lineItems?: { description: string; details?: string | null; quantity: number; unitPrice: number }[];
};

type CatalogItem = { id: string; name: string; description: string | null; clientDescription?: string | null; projectType?: string | null; unitPrice: number; currency: string; unit: string | null };

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
  recipients,
  taxLocation,
  chargeCanadianTax,
  lang,
  onSuccess,
  formId,
  hideSubmit,
  onPendingChange,
}: {
  action: (
    prevState: { error?: string; success?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string }>;
  defaultValues?: InvoiceFormValues;
  catalog: CatalogItem[];
  recipients?: RecipientOption[];
  taxLocation: { country: string | null; province: string | null };
  chargeCanadianTax: boolean;
  lang: Lang;
  onSuccess?: () => void;
  formId?: string;
  hideSubmit?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  useEffect(() => {
    onPendingChange?.(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);
  useEffect(() => {
    if (state?.success) onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const t = getDict(lang);

  const [lineItems, setLineItems] = useState<LineItemRow[]>(() =>
    (defaultValues?.lineItems ?? []).map((li, tempKey) => ({ tempKey, ...li, details: li.details ?? "" }))
  );
  const nextLineKey = useRef(lineItems.length);
  const [currency, setCurrency] = useState(defaultValues?.currency ?? "CAD");
  // Who the invoice goes to: the client's billing details by default; a linked contact,
  // another email or address can be chosen.
  const firstRecipient = recipients?.[0];
  const emailsOf = (r?: RecipientOption) => [...new Set([r?.billingEmail, ...(r?.emails ?? [])].filter((e): e is string => Boolean(e)))];
  const [recipientId, setRecipientId] = useState(defaultValues?.recipientContactId ?? firstRecipient?.id ?? "");
  const [recipientEmail, setRecipientEmail] = useState(defaultValues?.recipientEmail ?? emailsOf(firstRecipient)[0] ?? "");
  const [recipientAddress, setRecipientAddress] = useState(defaultValues?.recipientAddress ?? firstRecipient?.billingAddress ?? "");
  const STATUS_OPTIONS = ["DRAFT", "APPROVED", "SENT", "OVERDUE", "PAID"] as const;

  const totals = useMemo(
    () => computeBillingTotals(lineItems, taxLocation, chargeCanadianTax),
    [lineItems, taxLocation, chargeCanadianTax]
  );

  function addLineItem(preset?: { description: string; unitPrice: number; details?: string }) {
    setLineItems((rows) => [
      ...rows,
      { tempKey: nextLineKey.current++, description: preset?.description ?? "", details: preset?.details ?? "", quantity: 1, unitPrice: preset?.unitPrice ?? 0 },
    ]);
  }

  // Line items can be reordered with the arrows or by dragging the ⠿ handle.
  const [armedLine, setArmedLine] = useState<number | null>(null);
  const [dragLine, setDragLine] = useState<number | null>(null);
  const [overLine, setOverLine] = useState<number | null>(null);
  function moveLine(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= lineItems.length) return;
    setLineItems((rows) => {
      const next = [...rows];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function updateLineItem(tempKey: number, patch: Partial<LineItemRow>) {
    setLineItems((rows) => rows.map((r) => (r.tempKey === tempKey ? { ...r, ...patch } : r)));
  }

  return (
    <form id={formId} action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>{t.invoices.status}</label>
          <select name="status" defaultValue={defaultValues?.status && (STATUS_OPTIONS as readonly string[]).includes(defaultValues.status) ? defaultValues.status : "DRAFT"} className={FIELD_CLASS}>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {t.invoices.statuses[st]}
              </option>
            ))}
          </select>
        </div>
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

      {recipients && recipients.length > 0 && (
        <div className="rounded-lg border border-card-border p-4">
          <label className={LABEL_CLASS}>{lang === "fr" ? "Envoyer la facture à" : "Send the invoice to"}</label>
          <div className="mt-1 grid gap-3 sm:grid-cols-2">
            <div>
              <span className="text-xs text-soft">Contact</span>
              <select
                name="recipientContactId"
                value={recipientId}
                onChange={(e) => {
                  const r = recipients.find((x) => x.id === e.target.value);
                  setRecipientId(e.target.value);
                  setRecipientEmail(emailsOf(r)[0] ?? "");
                  setRecipientAddress(r?.billingAddress ?? "");
                }}
                className={FIELD_CLASS}
              >
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.company ? ` — ${r.company}` : ""}
                    {r.relation ? ` (${r.relation})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-xs text-soft">{lang === "fr" ? "Courriel" : "Email"}</span>
              <input name="recipientEmail" type="email" list="invoice-recipient-emails" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className={FIELD_CLASS} />
              <datalist id="invoice-recipient-emails">
                {emailsOf(recipients.find((r) => r.id === recipientId)).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <span className="text-xs text-soft">{lang === "fr" ? "Adresse (affichée sous « Facturé à »)" : 'Address (shown under "Bill to")'}</span>
              <select
                value=""
                onChange={(e) => {
                  const v = recipients.find((x) => x.id === recipientId)?.addresses[Number(e.target.value)]?.text;
                  if (v) setRecipientAddress(v);
                }}
                className={FIELD_CLASS}
              >
                <option value="">{lang === "fr" ? "Choisir parmi les adresses du contact…" : "Pick from this contact's addresses…"}</option>
                {(recipients.find((x) => x.id === recipientId)?.addresses ?? []).map((a, i) => (
                  <option key={i} value={i}>
                    {a.label} — {a.text.replace(/\n/g, ", ")}
                  </option>
                ))}
              </select>
              <textarea name="recipientAddress" rows={3} value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} className={FIELD_CLASS} />
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <label className={LABEL_CLASS}>{t.invoices.lineItemsTitle}</label>
          {catalog.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                const item = catalog.find((c) => c.id === e.target.value);
                if (item) addLineItem({ description: item.name, unitPrice: item.unitPrice, details: item.clientDescription || clientFacingDescription(item.description) });
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

        {lineItems.length > 0 && (
          <div className="mt-2 grid grid-cols-[1rem_minmax(0,1fr)_4.5rem_6.5rem_5rem_auto] items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-soft">
            <span />
            <span>{t.invoices.description}</span>
            <span>{t.invoices.quantity}</span>
            <span>{t.invoices.unitPrice}</span>
            <span className="text-right">Total</span>
            <span />
          </div>
        )}
        <div className="mt-1 space-y-2">
          {lineItems.map((row, ri) => (
            <div
              key={row.tempKey}
              draggable={armedLine === row.tempKey}
              onDragStart={(e) => {
                setDragLine(row.tempKey);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(row.tempKey));
              }}
              onDragOver={(e) => {
                if (dragLine === null) return;
                e.preventDefault();
                if (overLine !== row.tempKey) setOverLine(row.tempKey);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragLine !== null) moveLine(lineItems.findIndex((r) => r.tempKey === dragLine), ri);
                setDragLine(null);
                setOverLine(null);
                setArmedLine(null);
              }}
              onDragEnd={() => {
                setDragLine(null);
                setOverLine(null);
                setArmedLine(null);
              }}
              className={`space-y-1.5 rounded-lg border p-2 ${overLine === row.tempKey && dragLine !== row.tempKey ? "border-emerald-600 ring-2 ring-emerald-600" : "border-card-border"} ${dragLine === row.tempKey ? "opacity-50" : ""}`}
            >
            <div className="grid grid-cols-[1rem_minmax(0,1fr)_4.5rem_6.5rem_5rem_auto] items-center gap-2">
              <input type="hidden" name="lineItemDescription" value={row.description} />
              <input type="hidden" name="lineItemQuantity" value={row.quantity} />
              <input type="hidden" name="lineItemUnitPrice" value={row.unitPrice} />
              <input type="hidden" name="lineItemDetails" value={row.details} />
              <span
                title={lang === "fr" ? "Glisser pour déplacer" : "Drag to move"}
                onMouseDown={() => setArmedLine(row.tempKey)}
                onMouseUp={() => setArmedLine(null)}
                className="cursor-grab select-none text-sm leading-none text-soft hover:text-ink"
                aria-hidden
              >
                ⠿
              </span>
              <input
                value={row.description}
                onChange={(e) => updateLineItem(row.tempKey, { description: e.target.value })}
                placeholder={t.invoices.description}
                className={`${FIELD_CLASS} mt-0`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.quantity}
                onChange={(e) => updateLineItem(row.tempKey, { quantity: Number(e.target.value) })}
                placeholder={t.invoices.quantity}
                className={`${FIELD_CLASS} mt-0 px-2`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.unitPrice}
                onChange={(e) => updateLineItem(row.tempKey, { unitPrice: Number(e.target.value) })}
                placeholder={t.invoices.unitPrice}
                className={`${FIELD_CLASS} mt-0 px-2`}
              />
              <span className="text-right text-sm text-soft">{(row.quantity * row.unitPrice).toFixed(2)}</span>
              <span className="flex items-center gap-1">
                <button type="button" title={lang === "fr" ? "Monter" : "Move up"} onClick={() => moveLine(ri, ri - 1)} disabled={ri === 0} className="rounded-md border border-card-border px-1.5 py-2 text-xs text-soft hover:text-ink disabled:opacity-40">
                  ↑
                </button>
                <button type="button" title={lang === "fr" ? "Descendre" : "Move down"} onClick={() => moveLine(ri, ri + 1)} disabled={ri === lineItems.length - 1} className="rounded-md border border-card-border px-1.5 py-2 text-xs text-soft hover:text-ink disabled:opacity-40">
                  ↓
                </button>
                <button type="button" title={lang === "fr" ? "Supprimer" : "Delete"} onClick={() => setLineItems((rows) => rows.filter((r) => r.tempKey !== row.tempKey))} className="rounded-md border border-card-border px-1.5 py-2 text-xs text-soft hover:text-red-600">
                  ✕
                </button>
              </span>
            </div>
              <textarea
                value={row.details}
                onChange={(e) => updateLineItem(row.tempKey, { details: e.target.value })}
                rows={2}
                placeholder={lang === "fr" ? "Détails sous cette ligne dans le PDF…" : "Details under this line in the PDF…"}
                className={`${FIELD_CLASS} mt-0 text-xs`}
              />
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

      {!hideSubmit && (
      <button
        type="submit"
        disabled={pending}
        className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.common.saving : t.invoices.saveChanges}
        </button>
      )}
    </form>
  );
}
