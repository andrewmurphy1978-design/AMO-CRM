"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { draftProposalAI } from "@/actions/proposals";
import { computeBillingTotals } from "@/lib/billing-totals";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

type LineItemRow = { tempKey: number; description: string; quantity: number; unitPrice: number };
type ScheduleRow = { tempKey: number; label: string; percentage: number | null; amount: number | null; dueDate: string };

type ProposalFormValues = {
  title?: string;
  status?: string;
  currency?: string;
  coverLetter?: string | null;
  notes?: string | null;
  lineItems?: { description: string; quantity: number; unitPrice: number }[];
  paymentSchedule?: { label: string; percentage: number | null; amount: number | null; dueDate: Date | string | null }[];
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

export default function ProposalForm({
  action,
  projectId,
  defaultValues,
  catalog,
  taxLocation,
  chargeCanadianTax,
  submitLabel,
  lang,
}: {
  action: (
    prevState: { error?: string; success?: string; proposalId?: string } | undefined,
    formData: FormData
  ) => Promise<{ error?: string; success?: string; proposalId?: string }>;
  projectId: string;
  defaultValues?: ProposalFormValues;
  catalog: CatalogItem[];
  taxLocation: { country: string | null; province: string | null };
  chargeCanadianTax: boolean;
  submitLabel: string;
  lang: Lang;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = getDict(lang);

  const [lineItems, setLineItems] = useState<LineItemRow[]>(() =>
    (defaultValues?.lineItems ?? []).map((li, tempKey) => ({ tempKey, ...li }))
  );
  const nextLineKey = useRef(lineItems.length);

  const [schedule, setSchedule] = useState<ScheduleRow[]>(() =>
    (defaultValues?.paymentSchedule ?? []).map((row, tempKey) => ({
      tempKey,
      label: row.label,
      percentage: row.percentage,
      amount: row.amount,
      dueDate: toDateInput(row.dueDate),
    }))
  );
  const nextScheduleKey = useRef(schedule.length);

  const [coverLetter, setCoverLetter] = useState(defaultValues?.coverLetter ?? "");
  const [currency, setCurrency] = useState(defaultValues?.currency ?? "CAD");
  const [brief, setBrief] = useState("");
  const [aiPending, startAiTransition] = useTransition();
  const [aiError, setAiError] = useState<string | null>(null);

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

  function handleGenerateWithAI() {
    setAiError(null);
    startAiTransition(async () => {
      const result = await draftProposalAI(projectId, brief);
      if ("error" in result) {
        setAiError(result.error);
        return;
      }
      setCoverLetter(result.coverLetter);
      setLineItems(result.lineItems.map((li, tempKey) => ({ tempKey, ...li })));
      nextLineKey.current = result.lineItems.length;
    });
  }

  const STATUSES = [
    { value: "DRAFT", label: t.proposals.statuses.DRAFT },
    { value: "SENT", label: t.proposals.statuses.SENT },
    { value: "ACCEPTED", label: t.proposals.statuses.ACCEPTED },
    { value: "DECLINED", label: t.proposals.statuses.DECLINED },
  ];

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="coverLetter" value={coverLetter} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>{t.proposals.titlePlaceholder}</label>
          <input name="title" required defaultValue={defaultValues?.title} className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.proposals.currency}</label>
          <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={FIELD_CLASS}>
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.proposals.status}</label>
          <select name="status" defaultValue={defaultValues?.status ?? "DRAFT"} className={FIELD_CLASS}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* AI drafting */}
      <div className="rounded-lg border border-card-border bg-field-bg p-4">
        <label className={LABEL_CLASS}>{t.proposals.briefLabel}</label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={2}
          placeholder={t.proposals.briefPlaceholder}
          className={FIELD_CLASS}
        />
        <button
          type="button"
          onClick={handleGenerateWithAI}
          disabled={aiPending || !brief.trim()}
          className="mt-2 rounded-md bg-[#0fa38a] px-3 py-1.5 text-xs font-medium text-[#f4faf6] hover:opacity-90 disabled:opacity-40"
        >
          {aiPending ? t.proposals.generating : t.proposals.generateWithAI}
        </button>
        {aiError && <p className="mt-2 text-xs text-red-600">{aiError}</p>}
      </div>

      <div>
        <label className={LABEL_CLASS}>{t.proposals.coverLetter}</label>
        <textarea
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          rows={4}
          className={FIELD_CLASS}
        />
      </div>

      {/* Line items */}
      <div>
        <div className="flex items-center justify-between">
          <label className={LABEL_CLASS}>{t.proposals.lineItemsTitle}</label>
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
                {t.proposals.pickFromPriceList}
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
                placeholder={t.proposals.description}
                className={`${FIELD_CLASS} mt-0 min-w-[10rem] flex-1`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.quantity}
                onChange={(e) => updateLineItem(row.tempKey, { quantity: Number(e.target.value) })}
                placeholder={t.proposals.quantity}
                className={`${FIELD_CLASS} mt-0 w-20`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.unitPrice}
                onChange={(e) => updateLineItem(row.tempKey, { unitPrice: Number(e.target.value) })}
                placeholder={t.proposals.unitPrice}
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
          {lineItems.length === 0 && <p className="text-sm text-soft">{t.proposals.noLineItems}</p>}
          <button
            type="button"
            onClick={() => addLineItem()}
            className="text-xs font-semibold text-amo-lime hover:underline"
          >
            + {t.proposals.addLineItem}
          </button>
        </div>

        {/* Live totals preview */}
        <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-soft">{t.proposals.subtotal}</span>
            <span className="text-ink">
              {totals.subtotal.toFixed(2)} {currency}
            </span>
          </div>
          {totals.gst > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.proposals.gst}</span>
              <span className="text-ink">
                {totals.gst.toFixed(2)} {currency}
              </span>
            </div>
          )}
          {totals.qst > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.proposals.qst}</span>
              <span className="text-ink">
                {totals.qst.toFixed(2)} {currency}
              </span>
            </div>
          )}
          {totals.hst > 0 && (
            <div className="flex justify-between">
              <span className="text-soft">{t.proposals.hst}</span>
              <span className="text-ink">
                {totals.hst.toFixed(2)} {currency}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-card-border pt-1 font-semibold">
            <span className="text-ink">{t.proposals.totalDue}</span>
            <span className="text-ink">
              {totals.totalAmount.toFixed(2)} {currency}
            </span>
          </div>
        </div>
      </div>

      {/* Payment schedule */}
      <div>
        <label className={LABEL_CLASS}>{t.proposals.paymentScheduleTitle}</label>
        <div className="mt-2 space-y-2">
          {schedule.map((row) => (
            <div key={row.tempKey} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="scheduleLabel" value={row.label} />
              <input type="hidden" name="schedulePercentage" value={row.percentage ?? ""} />
              <input type="hidden" name="scheduleAmount" value={row.amount ?? ""} />
              <input type="hidden" name="scheduleDueDate" value={row.dueDate} />
              <input
                value={row.label}
                onChange={(e) =>
                  setSchedule((rows) => rows.map((r) => (r.tempKey === row.tempKey ? { ...r, label: e.target.value } : r)))
                }
                placeholder={t.proposals.scheduleLabelField}
                className={`${FIELD_CLASS} mt-0 min-w-[8rem] flex-1`}
              />
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={row.percentage ?? ""}
                onChange={(e) =>
                  setSchedule((rows) =>
                    rows.map((r) => (r.tempKey === row.tempKey ? { ...r, percentage: e.target.value ? Number(e.target.value) : null } : r))
                  )
                }
                placeholder={t.proposals.percentage}
                className={`${FIELD_CLASS} mt-0 w-24`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.amount ?? ""}
                onChange={(e) =>
                  setSchedule((rows) =>
                    rows.map((r) => (r.tempKey === row.tempKey ? { ...r, amount: e.target.value ? Number(e.target.value) : null } : r))
                  )
                }
                placeholder={t.proposals.fixedAmount}
                className={`${FIELD_CLASS} mt-0 w-28`}
              />
              <input
                type="date"
                value={row.dueDate}
                onChange={(e) =>
                  setSchedule((rows) => rows.map((r) => (r.tempKey === row.tempKey ? { ...r, dueDate: e.target.value } : r)))
                }
                className={`${FIELD_CLASS} mt-0 w-40`}
              />
              <button
                type="button"
                onClick={() => setSchedule((rows) => rows.filter((r) => r.tempKey !== row.tempKey))}
                className="rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
              >
                ✕
              </button>
            </div>
          ))}
          {schedule.length === 0 && <p className="text-sm text-soft">{t.proposals.noPaymentSchedule}</p>}
          <button
            type="button"
            onClick={() =>
              setSchedule((rows) => [
                ...rows,
                { tempKey: nextScheduleKey.current++, label: "", percentage: null, amount: null, dueDate: "" },
              ])
            }
            className="text-xs font-semibold text-amo-lime hover:underline"
          >
            + {t.proposals.addScheduleItem}
          </button>
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
        {pending ? t.common.saving : submitLabel}
      </button>
    </form>
  );
}
