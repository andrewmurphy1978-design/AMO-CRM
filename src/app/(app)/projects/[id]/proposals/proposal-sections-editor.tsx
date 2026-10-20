"use client";

import { useMemo } from "react";
import { computeSectionedTotals, defaultInstalmentsFor, PREP_KIND, type ProposalSectionInput } from "@/lib/proposal-sections";
import { clientFacingDescription } from "@/lib/catalog-text";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export type EditorSection = ProposalSectionInput & { key: number };
export type TypeOption = { value: string; label: string };

type CatalogItem = { id: string; name: string; description: string | null; clientDescription?: string | null; unitPrice: number; currency: string };

const FIELD_CLASS =
  "w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

export default function ProposalSectionsEditor({
  sections,
  onChange,
  catalog,
  taxLocation,
  chargeCanadianTax,
  currency,
  nextKey,
  typeOptions,
  lang,
}: {
  sections: EditorSection[];
  onChange: (sections: EditorSection[]) => void;
  catalog: CatalogItem[];
  taxLocation: { country: string | null; province: string | null };
  chargeCanadianTax: boolean;
  currency: string;
  nextKey: () => number;
  // Project types a section can be for (the project's own types first).
  typeOptions: TypeOption[];
  lang: Lang;
}) {
  const t = getDict(lang).proposals;
  const totals = useMemo(
    () => computeSectionedTotals(sections, taxLocation, chargeCanadianTax),
    [sections, taxLocation, chargeCanadianTax]
  );
  const money = (n: number) => `${n.toFixed(2)} ${currency}`;

  function patch(key: number, p: Partial<EditorSection>) {
    onChange(sections.map((s) => (s.key === key ? { ...s, ...p } : s)));
  }

  const kindLabel = (kind: string) => (kind === PREP_KIND ? t.prepSection : (typeOptions.find((o) => o.value === kind)?.label ?? kind));

  function addSection(kind: string) {
    onChange([
      ...sections,
      {
        key: nextKey(),
        kind,
        title: kindLabel(kind),
        lineItems: [],
        instalments: defaultInstalmentsFor(kind, {
          deposit: t.instalmentDeposit,
          startBuild: t.instalmentStartBuild,
          beforeLaunch: t.instalmentBeforeLaunch,
        }),
      },
    ]);
  }

  let instalmentNo = 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-soft">{t.sectionedHint}</p>

      {sections.map((section, si) => {
        const st = totals.sections[si];
        return (
          <div key={section.key} className="rounded-lg border border-card-border p-4">
            <div className="flex items-center gap-2">
              <input
                value={section.title}
                onChange={(e) => patch(section.key, { title: e.target.value })}
                placeholder={t.sectionTitle}
                className={`${FIELD_CLASS} font-semibold`}
              />
              <button
                type="button"
                onClick={() => onChange(sections.filter((s) => s.key !== section.key))}
                title={t.removeSection}
                className="rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
              >
                ✕
              </button>
            </div>

            {/* Line items */}
            <div className="mt-3 flex items-center justify-between">
              <span className={LABEL_CLASS}>{t.lineItemsTitle}</span>
              {catalog.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const item = catalog.find((c) => c.id === e.target.value);
                    if (item)
                      patch(section.key, {
                        lineItems: [...section.lineItems, { description: item.name, details: item.clientDescription || clientFacingDescription(item.description), quantity: 1, unitPrice: item.unitPrice }],
                      });
                    e.target.value = "";
                  }}
                  className="rounded-md border border-card-border bg-field-bg px-2 py-1 text-xs text-ink"
                >
                  <option value="" disabled>
                    {t.pickFromPriceList}
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
              {section.lineItems.map((li, i) => {
                const setLi = (p: Partial<typeof li>) =>
                  patch(section.key, { lineItems: section.lineItems.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[10rem] flex-1">
                      <input
                        value={li.description}
                        onChange={(e) => setLi({ description: e.target.value })}
                        placeholder={t.description}
                        className={FIELD_CLASS}
                      />
                      <textarea
                        value={li.details ?? ""}
                        onChange={(e) => setLi({ details: e.target.value })}
                        rows={1}
                        placeholder={lang === "fr" ? "Détails (facultatif)" : "Details (optional)"}
                        className={`${FIELD_CLASS} mt-1 text-xs`}
                      />
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={li.quantity}
                      onChange={(e) => setLi({ quantity: Number(e.target.value) })}
                      placeholder={t.quantity}
                      className={`${FIELD_CLASS} w-20`}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={li.unitPrice}
                      onChange={(e) => setLi({ unitPrice: Number(e.target.value) })}
                      placeholder={t.unitPrice}
                      className={`${FIELD_CLASS} w-28`}
                    />
                    <span className="w-24 text-right text-sm text-soft">{(li.quantity * li.unitPrice).toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => patch(section.key, { lineItems: section.lineItems.filter((_, j) => j !== i) })}
                      className="rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {section.lineItems.length === 0 && <p className="text-sm text-soft">{t.noLineItems}</p>}
              <button
                type="button"
                onClick={() =>
                  patch(section.key, { lineItems: [...section.lineItems, { description: "", quantity: 1, unitPrice: 0 }] })
                }
                className="text-xs font-semibold text-amo-lime hover:underline"
              >
                + {t.addLineItem}
              </button>
            </div>

            <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-soft">{t.subtotal}</span>
                <span className="text-ink">{money(st.subtotal)}</span>
              </div>
              {st.total > 0 && (
                <div className="flex justify-between">
                  <span className="text-soft">{[st.gst && t.gst, st.qst && t.qst, st.hst && t.hst].filter(Boolean).join(" + ")}</span>
                  <span className="text-ink">{money(st.total)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-card-border pt-1 font-semibold">
                <span className="text-ink">{t.sectionTotal}</span>
                <span className="text-ink">{money(st.totalAmount)}</span>
              </div>
            </div>

            {/* Instalments */}
            <div className="mt-4">
              <span className={LABEL_CLASS}>{t.instalmentsTitle}</span>
              <div className="mt-2 space-y-2">
                {section.instalments.map((row, i) => {
                  const setRow = (p: Partial<typeof row>) =>
                    patch(section.key, { instalments: section.instalments.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        value={row.label}
                        onChange={(e) => setRow({ label: e.target.value })}
                        placeholder={t.scheduleLabelField}
                        className={`${FIELD_CLASS} min-w-[8rem] flex-1`}
                      />
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={row.percentage ?? ""}
                        onChange={(e) => setRow({ percentage: e.target.value ? Number(e.target.value) : null })}
                        placeholder={t.pctOfSection}
                        className={`${FIELD_CLASS} w-24`}
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.amount ?? ""}
                        onChange={(e) => setRow({ amount: e.target.value ? Number(e.target.value) : null })}
                        placeholder={t.fixedAmount}
                        className={`${FIELD_CLASS} w-28`}
                      />
                      <input
                        type="date"
                        value={row.dueDate ?? ""}
                        onChange={(e) => setRow({ dueDate: e.target.value || null })}
                        className={`${FIELD_CLASS} w-40`}
                      />
                      <span className="w-24 text-right text-sm text-soft">{st.instalmentAmounts[i].toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => patch(section.key, { instalments: section.instalments.filter((_, j) => j !== i) })}
                        className="rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() =>
                    patch(section.key, {
                      instalments: [...section.instalments, { label: "", percentage: null, amount: null, dueDate: null }],
                    })
                  }
                  className="text-xs font-semibold text-amo-lime hover:underline"
                >
                  + {t.addInstalment}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <select
        value=""
        onChange={(e) => e.target.value && addSection(e.target.value)}
        className="rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-xs font-semibold text-amo-lime"
      >
        <option value="">+ {t.addSection}…</option>
        <option value={PREP_KIND}>{t.prepSection}</option>
        {typeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Final summary */}
      {sections.length > 0 && (
        <div className="rounded-lg border border-card-border bg-field-bg p-4 text-sm">
          <h3 className={LABEL_CLASS}>{t.summaryTitle}</h3>
          <div className="mt-2 space-y-1">
            {sections.map((s, i) => (
              <div key={s.key} className="flex justify-between">
                <span className="text-soft">{s.title}</span>
                <span className="text-ink">{money(totals.sections[i].totalAmount)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-card-border pt-1 font-semibold">
              <span className="text-ink">{t.totalDue}</span>
              <span className="text-ink">{money(totals.grand.totalAmount)}</span>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {sections.flatMap((s, i) =>
              s.instalments.map((row, j) => (
                <div key={`${s.key}-${j}`} className="flex justify-between">
                  <span className="text-soft">
                    {t.instalmentNumber} {++instalmentNo} — {s.title}: {row.label}
                  </span>
                  <span className="text-ink">{money(totals.sections[i].instalmentAmounts[j])}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
