"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { draftProposalAI } from "@/actions/proposals";
import { computeBillingTotals } from "@/lib/billing-totals";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { clientFacingDescription } from "@/lib/catalog-text";

type LineItemRow = { tempKey: number; description: string; details: string; quantity: number; unitPrice: number };
type SubRow = { tempKey: number; name: string; amount: number; period: string; note: string };
type ScheduleRow = { tempKey: number; label: string; percentage: number | null; amount: number | null; dueDate: string };

type ProposalFormValues = {
  title?: string;
  status?: string;
  currency?: string;
  coverLetter?: string | null;
  notes?: string | null;
  lineItems?: { description: string; details?: string | null; quantity: number; unitPrice: number }[];
  subscriptions?: { name: string; amount: number; period: string; note: string }[];
  paymentSchedule?: { label: string; percentage: number | null; amount: number | null; dueDate: Date | string | null }[];
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

export default function ProposalForm({
  action,
  projectId,
  defaultValues,
  catalog,
  taxLocation,
  chargeCanadianTax,
  submitLabel,
  lang,
  inline,
  onSuccess,
  projectType,
  formId,
  hideSubmit,
  onPendingChange,
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
  // In a dialog: stay on the page and report back when saved.
  inline?: boolean;
  onSuccess?: () => void;
  // Services of this project type are listed first in the price-list picker.
  projectType?: string;
  // Dialog mode: the save button lives in the dialog header (it submits this form by id).
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
  const [subs, setSubs] = useState<SubRow[]>(() => (defaultValues?.subscriptions ?? []).map((x, tempKey) => ({ tempKey, ...x })));
  const nextSubKey = useRef(subs.length);

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

  function addLineItem(preset?: { description: string; unitPrice: number; details?: string }) {
    setLineItems((rows) => [
      ...rows,
      { tempKey: nextLineKey.current++, description: preset?.description ?? "", details: preset?.details ?? "", quantity: 1, unitPrice: preset?.unitPrice ?? 0 },
    ]);
  }

  function updateLineItem(tempKey: number, patch: Partial<LineItemRow>) {
    setLineItems((rows) => rows.map((r) => (r.tempKey === tempKey ? { ...r, ...patch } : r)));
  }

  function handleGenerateWithAI() {
    setAiError(null);
    startAiTransition(async () => {
      let result: Awaited<ReturnType<typeof draftProposalAI>>;
      try {
        result = await draftProposalAI(projectId, brief);
      } catch {
        setAiError("The AI request didn't come back (it may have timed out) — try again.");
        return;
      }
      if (!result || "error" in result) {
        setAiError(result && "error" in result ? result.error : "The AI returned nothing — try again.");
        return;
      }
      setCoverLetter(result.coverLetter);
      setLineItems(result.lineItems.map((li, tempKey) => ({ tempKey, ...li, details: li.details ?? "" })));
      nextLineKey.current = result.lineItems.length;
      if (result.subscriptions && result.subscriptions.length > 0 && subs.length === 0) {
        setSubs(result.subscriptions.map((x, tempKey) => ({ tempKey, ...x })));
        nextSubKey.current = result.subscriptions.length;
      }
    });
  }

  const STATUSES = [
    { value: "DRAFT", label: t.proposals.statuses.DRAFT },
    { value: "SENT", label: t.proposals.statuses.SENT },
    { value: "ACCEPTED", label: t.proposals.statuses.ACCEPTED },
    { value: "DECLINED", label: t.proposals.statuses.DECLINED },
  ];

  return (
    <form id={formId} action={formAction} className="space-y-6">
      <input type="hidden" name="projectId" value={projectId} />
      {inline && <input type="hidden" name="inline" value="1" />}
      <input type="hidden" name="coverLetter" value={coverLetter} />

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_11rem]">
        <div>
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
          disabled={aiPending}
          className="mt-2 rounded-md bg-[#0fa38a] px-3 py-1.5 text-xs font-medium text-[#f4faf6] hover:opacity-90 disabled:opacity-40"
        >
          {aiPending ? t.proposals.generating : t.proposals.generateWithAI}
        </button>
        <p className="mt-2 text-xs text-soft">
          {lang === "fr"
            ? "Laissez la zone vide pour utiliser les détails du projet, du client et de sa marque. Nécessite la clé API Anthropic (Paramètres)."
            : "Leave the box empty to use the project, client and brand details. Needs the Anthropic API key (Settings)."}
        </p>
        {aiError && <p className="mt-2 text-xs text-red-600">{aiError}</p>}
      </div>

      <div>
        <label className={LABEL_CLASS}>{t.proposals.coverLetter}</label>
        <textarea
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          rows={9}
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
                if (item) addLineItem({ description: item.name, unitPrice: item.unitPrice, details: item.clientDescription || clientFacingDescription(item.description) });
                e.target.value = "";
              }}
              className="rounded-md border border-card-border bg-field-bg px-2 py-1 text-xs text-ink"
            >
              <option value="" disabled>
                {t.proposals.pickFromPriceList}
              </option>
              {[...catalog].sort((a, b) => Number(b.projectType === projectType && Boolean(projectType)) - Number(a.projectType === projectType && Boolean(projectType))).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.projectType && c.projectType === projectType ? "★ " : ""}
                  {c.name} ({c.unitPrice} {c.currency})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mt-2 space-y-2">
          {lineItems.map((row) => (
            <div key={row.tempKey} className="space-y-1.5 rounded-lg border border-card-border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="lineItemDescription" value={row.description} />
              <input type="hidden" name="lineItemQuantity" value={row.quantity} />
              <input type="hidden" name="lineItemUnitPrice" value={row.unitPrice} />
              <input type="hidden" name="lineItemDetails" value={row.details} />
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
              <textarea
                value={row.details}
                onChange={(e) => updateLineItem(row.tempKey, { details: e.target.value })}
                rows={2}
                placeholder={lang === "fr" ? "Détails affichés sous cette ligne dans le PDF (ce qui est inclus)…" : "Details shown under this line in the PDF (what's included)…"}
                className={`${FIELD_CLASS} mt-0 text-xs`}
              />
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

      {/* Apps & subscriptions */}
      <div>
        <label className={LABEL_CLASS}>{lang === "fr" ? "Applications et abonnements" : "Apps & subscriptions"}</label>
        <p className="text-xs text-soft">
          {lang === "fr"
            ? "Frais payés directement aux fournisseurs (Systeme.io, hébergement, domaine…). Affichés dans la section Investissement du PDF, hors du total ci-dessus."
            : "Fees the client pays the providers directly (Systeme.io, hosting, domain…). Shown in the PDF's Investment section, outside the total above."}
        </p>
        <div className="mt-2 space-y-2">
          {subs.map((row) => (
            <div key={row.tempKey} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="subName" value={row.name} />
              <input type="hidden" name="subAmount" value={row.amount} />
              <input type="hidden" name="subPeriod" value={row.period} />
              <input type="hidden" name="subNote" value={row.note} />
              <input
                value={row.name}
                list="sub-suggestions"
                onChange={(e) => setSubs((rows) => rows.map((r) => (r.tempKey === row.tempKey ? { ...r, name: e.target.value } : r)))}
                placeholder={lang === "fr" ? "Application / service" : "App / service"}
                className={`${FIELD_CLASS} mt-0 min-w-[9rem] flex-1`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.amount}
                onChange={(e) => setSubs((rows) => rows.map((r) => (r.tempKey === row.tempKey ? { ...r, amount: Number(e.target.value) } : r)))}
                className={`${FIELD_CLASS} mt-0 w-28`}
              />
              <select
                value={row.period}
                onChange={(e) => setSubs((rows) => rows.map((r) => (r.tempKey === row.tempKey ? { ...r, period: e.target.value } : r)))}
                className={`${FIELD_CLASS} mt-0 w-32`}
              >
                <option value="month">{lang === "fr" ? "/ mois" : "/ month"}</option>
                <option value="year">{lang === "fr" ? "/ an" : "/ year"}</option>
                <option value="once">{lang === "fr" ? "une fois" : "one-time"}</option>
              </select>
              <input
                value={row.note}
                onChange={(e) => setSubs((rows) => rows.map((r) => (r.tempKey === row.tempKey ? { ...r, note: e.target.value } : r)))}
                placeholder={lang === "fr" ? "Note (forfait, etc.)" : "Note (plan, etc.)"}
                className={`${FIELD_CLASS} mt-0 min-w-[8rem] flex-1`}
              />
              <button
                type="button"
                onClick={() => setSubs((rows) => rows.filter((r) => r.tempKey !== row.tempKey))}
                className="rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
              >
                ✕
              </button>
            </div>
          ))}
          <datalist id="sub-suggestions">
            {["Systeme.io", "ClickFunnels", "GoHighLevel", "WordPress hosting", "GoDaddy hosting", "Domain name", "Make", "Zapier", "Buffer", "GetResponse", "ChatGPT / AI tools"].map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => setSubs((rows) => [...rows, { tempKey: nextSubKey.current++, name: "", amount: 0, period: "month", note: "" }])}
            className="text-xs font-semibold text-amo-lime hover:underline"
          >
            + {lang === "fr" ? "Ajouter un abonnement" : "Add a subscription"}
          </button>
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
        {pending ? t.common.saving : submitLabel}
        </button>
      )}
    </form>
  );
}
