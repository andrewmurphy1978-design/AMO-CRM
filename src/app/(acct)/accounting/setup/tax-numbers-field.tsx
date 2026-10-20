"use client";

import { useState } from "react";
import { TAX_NUMBER_TYPES, typesFor, type TaxNumber, type TaxNumberType } from "@/lib/accounting/tax-numbers";
const inputCls = "rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

// Any number of registration numbers; submitted as repeated taxType / taxNumberValue / taxRegion fields.
export default function TaxNumbersField({ lang, country, initial, note }: { lang: "en" | "fr"; country: string; initial: TaxNumber[]; note?: boolean }) {
  const fr = lang === "fr";
  const [ctry, setCtry] = useState(country);
  const [rows, setRows] = useState<TaxNumber[]>(initial);
  const types = typesFor(ctry);
  const set = (i: number, p: Partial<TaxNumber>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="w-full space-y-2 rounded-lg border border-card-border p-3">
      <p className="text-xs font-medium text-ink">{fr ? "Numéros d'inscription (plusieurs possibles)" : "Registration numbers (as many as apply)"}</p>
      {note && (
        <label className="flex items-center gap-2 text-xs text-soft">
          {fr ? "Pays des numéros :" : "Numbers for:"}
          <select value={ctry} onChange={(e) => { setCtry(e.target.value); setRows([]); }} className={inputCls}>
            <option value="CA">{fr ? "Canada" : "Canada"}</option>
            <option value="US">{fr ? "États-Unis (LLC)" : "United States (LLC)"}</option>
          </select>
        </label>
      )}
      {rows.map((r, i) => {
        const def = TAX_NUMBER_TYPES[r.type];
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select name="taxType" value={r.type} onChange={(e) => set(i, { type: e.target.value as TaxNumberType })} className={inputCls}>
              {types.map((t) => <option key={t} value={t}>{TAX_NUMBER_TYPES[t][lang]}</option>)}
            </select>
            <input name="taxNumberValue" value={r.number} onChange={(e) => set(i, { number: e.target.value })} placeholder={def.placeholder} className={`${inputCls} w-52`} />
            {def.region ? (
              <input name="taxRegion" value={r.region ?? ""} maxLength={2} onChange={(e) => set(i, { region: e.target.value })} placeholder={fr ? "État" : "State"} className={`${inputCls} w-20 uppercase`} />
            ) : (
              <input type="hidden" name="taxRegion" value="" />
            )}
            <button type="button" className="text-xs text-red-600" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</button>
          </div>
        );
      })}
      <button type="button" className="text-xs text-soft underline" onClick={() => setRows((r) => [...r, { type: types[0], number: "" }])}>
        {fr ? "+ Ajouter un numéro" : "+ Add a number"}
      </button>
      <p className="text-xs text-soft">
        {ctry === "US"
          ? fr
            ? "LLC : un EIN fédéral, plus un permis de taxe de vente par État où vous percevez la taxe (pas de taxe de vente fédérale)."
            : "LLC: one federal EIN, plus a sales-tax permit for each state where you collect tax (there is no federal sales tax)."
          : fr
            ? "Les numéros de TVP (C.-B., Manitoba, Saskatchewan) sont conservés pour vos dossiers ; la TVP n'est pas récupérable et n'est pas calculée automatiquement."
            : "BC, Manitoba and Saskatchewan PST/RST numbers are stored for your records; those taxes are not recoverable and are not calculated automatically."}
      </p>
    </div>
  );
}
