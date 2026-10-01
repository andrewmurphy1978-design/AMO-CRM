"use client";

import { useState } from "react";
import { type Lang } from "@/lib/i18n/dictionaries";
import { getDict } from "@/lib/i18n/dictionaries";
import { CARD_COLORS } from "@/components/section-card";
import { BRAND_CATEGORIES, safeHexColor, type BrandItemInput } from "@/lib/brand";
import SectionDialog, { EditCardButton } from "./section-dialog";

const FIELD = "w-full min-w-0 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

export default function BrandDialog({
  action,
  items,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  items: BrandItemInput[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const fr = lang === "fr";
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BrandItemInput[]>(items);

  const update = (index: number, patch: Partial<BrandItemInput>) => setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <>
      <EditCardButton
        onClick={() => {
          setRows(items);
          setOpen(true);
        }}
        label={t.contactDetail.edit}
      />
      <SectionDialog open={open} onOpenChange={setOpen} title="Brand" action={action} labels={t.phaseDialog} wide headerColorClassName={CARD_COLORS.brand}>
        <input type="hidden" name="brand" value={JSON.stringify(rows)} />
        <div className="space-y-5">
          {BRAND_CATEGORIES.map((cat) => {
            const catRows = rows.map((row, index) => ({ row, index })).filter((x) => x.row.category === cat.key);
            return (
              <section key={cat.key}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-soft">{fr ? cat.fr : cat.en}</h4>
                  <button
                    type="button"
                    onClick={() => setRows((r) => [...r, { category: cat.key, label: "", value: cat.mode === "color" ? "#" : "", note: "" }])}
                    className="rounded-md border border-card-border px-2 py-0.5 text-xs font-medium text-ink hover:bg-black/5"
                  >
                    + {fr ? "Ajouter" : "Add"}
                  </button>
                </div>
                <div className="mt-1 space-y-2">
                  {catRows.length === 0 && <p className="text-xs text-soft">—</p>}
                  {catRows.map(({ row, index }) => (
                    <div key={index} className="grid grid-cols-1 gap-1.5 rounded-lg bg-black/[0.03] p-2 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
                      <input value={row.label} onChange={(e) => update(index, { label: e.target.value })} placeholder={fr ? cat.labelHint.fr : cat.labelHint.en} className={FIELD} />
                      {cat.mode === "text" ? (
                        <textarea rows={2} value={row.value} onChange={(e) => update(index, { value: e.target.value })} placeholder={fr ? cat.valueHint.fr : cat.valueHint.en} className={FIELD} />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {cat.mode === "color" && (
                            <span className="h-7 w-7 shrink-0 rounded border border-card-border" style={{ backgroundColor: safeHexColor(row.value) ?? "transparent" }} />
                          )}
                          <input value={row.value} onChange={(e) => update(index, { value: e.target.value })} placeholder={fr ? cat.valueHint.fr : cat.valueHint.en} className={FIELD} />
                        </div>
                      )}
                      <input value={row.note} onChange={(e) => update(index, { note: e.target.value })} placeholder={fr ? "Note" : "Note"} className={FIELD} />
                      <button type="button" onClick={() => setRows((r) => r.filter((_, i) => i !== index))} className="rounded-md px-2 text-sm text-red-600 hover:bg-red-50" aria-label="Remove">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </SectionDialog>
    </>
  );
}
