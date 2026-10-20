"use client";

import { useState, type ReactNode } from "react";
import Combobox from "@/components/combobox";
import { FIELD_CLASS, LABEL_CLASS } from "@/app/(app)/contacts/[id]/section-dialog";
import { ASSET_SECTIONS, LIABILITY_SECTIONS, REGISTERED_TYPES, usesGifi } from "@/lib/accounting/charts";
import type { AccountOption, EntityInfo } from "@/lib/accounting/options";
import { parentChoices } from "@/lib/accounting/tree";
import TaxNumbersField from "./tax-numbers-field";

type Lang = "en" | "fr";

export const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "CHF", "AUD", "MXN"] as const;

function F({ label, children, span }: { label: string; children: ReactNode; span?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <label className={LABEL_CLASS}>{label}</label>
      {children}
    </div>
  );
}
const Check = ({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) => (
  <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
    <input type="checkbox" name={name} defaultChecked={defaultChecked} className="accent-amo-lime" /> {label}
  </label>
);
const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;

export function CurrencyDropdown({ lang, defaultValue }: { lang: Lang; defaultValue?: string }) {
  return <Combobox label={lang === "fr" ? "Devise" : "Currency"} name="currency" defaultValue={defaultValue ?? ""} options={CURRENCIES} placeholder="CAD" />;
}

// ---- entity (add and edit)
export function EntityFields({ lang, entity }: { lang: Lang; entity?: EntityInfo }) {
  const fr = lang === "fr";
  return (
    <Grid>
      <F label={fr ? "Nom" : "Name"}><input name="name" required defaultValue={entity?.name} className={FIELD_CLASS} /></F>
      {entity ? (
        <F label={fr ? "Méthode comptable" : "Accounting basis"}>
          <select name="basis" defaultValue={entity.basis} className={FIELD_CLASS}>
            <option value="CASH">{fr ? "Caisse" : "Cash"}</option>
            <option value="ACCRUAL">{fr ? "Exercice (comptabilité d'engagement)" : "Accrual"}</option>
          </select>
        </F>
      ) : (
        <F label={fr ? "Type" : "Type"}>
          <select name="kind" defaultValue="CORPORATION" className={FIELD_CLASS}>
            <option value="CORPORATION">{fr ? "Société par actions (Canada)" : "Corporation (Canada)"}</option>
            <option value="LLC">{fr ? "LLC américaine" : "US LLC"}</option>
            <option value="SOLE_PROPRIETORSHIP">{fr ? "Entreprise individuelle" : "Sole proprietorship"}</option>
          </select>
        </F>
      )}
      <F label={fr ? "Province / État" : "Province / State"}><input name="province" defaultValue={entity?.province ?? ""} placeholder="QC" className={FIELD_CLASS} /></F>
      <F label={fr ? "Fin d'exercice (mois)" : "Year-end month"}><input name="fiscalYearEndMonth" type="number" min={1} max={12} defaultValue={entity?.fiscalYearEndMonth ?? 12} className={FIELD_CLASS} /></F>
      <div className="sm:col-span-2"><TaxNumbersField lang={lang} country={entity?.country ?? "CA"} initial={entity?.taxNumbers ?? []} note={!entity} /></div>
      <Check name="salesTaxRegistered" label={fr ? "Inscrite aux taxes de vente" : "Registered for sales tax"} defaultChecked={entity?.salesTaxRegistered} />
    </Grid>
  );
}

// ---- bank / card / registered account (add and edit)
export interface BankFieldsValue {
  name: string;
  nameFr: string | null;
  institution: string | null;
  last4: string | null;
  inverted: boolean;
  currency: string;
}
export function BankFields({ lang, entities, defaultEntityId, bank }: { lang: Lang; entities?: EntityInfo[]; defaultEntityId?: string; bank?: BankFieldsValue }) {
  const fr = lang === "fr";
  return (
    <Grid>
      {entities && (
        <F label={fr ? "Appartient à" : "Belongs to"}>
          <select name="entityId" defaultValue={defaultEntityId} className={FIELD_CLASS}>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        </F>
      )}
      {entities && (
        <F label={fr ? "Type" : "Type"}>
          <select name="kind" className={FIELD_CLASS}>
            <option value="CHEQUING">{fr ? "Compte chèques" : "Chequing"}</option>
            <option value="SAVINGS">{fr ? "Épargne" : "Savings"}</option>
            <option value="CREDIT_CARD">{fr ? "Carte de crédit" : "Credit card"}</option>
            {Object.entries(REGISTERED_TYPES).map(([k, v]) => <option key={k} value={k}>{v[lang]}</option>)}
          </select>
        </F>
      )}
      <F label={fr ? "Description anglaise" : "English description"}><input name="name" required defaultValue={bank?.name} placeholder="Desjardins chequing" className={FIELD_CLASS} /></F>
      <F label={fr ? "Description française" : "French description"}><input name="nameFr" defaultValue={bank?.nameFr ?? ""} placeholder="Desjardins chèques" className={FIELD_CLASS} /></F>
      <F label={fr ? "Institution" : "Institution"}><input name="institution" defaultValue={bank?.institution ?? ""} className={FIELD_CLASS} /></F>
      <F label={fr ? "4 derniers chiffres" : "Last 4 digits"}><input name="last4" maxLength={4} defaultValue={bank?.last4 ?? ""} className={FIELD_CLASS} /></F>
      <CurrencyDropdown lang={lang} defaultValue={bank?.currency} />
      <Check name="invertSign" label={fr ? "Inverser les signes à l'import" : "Invert signs on import"} defaultChecked={bank?.inverted} />
    </Grid>
  );
}

// ---- chart account (add)
export function AccountFields({ lang, entities, options, defaultEntityId, defaultType }: { lang: Lang; entities: EntityInfo[]; options: AccountOption[]; defaultEntityId?: string; defaultType?: string }) {
  const fr = lang === "fr";
  const [entityId, setEntityId] = useState(defaultEntityId ?? entities[0]?.id ?? "");
  const [type, setType] = useState(defaultType ?? "EXPENSE");
  const [section, setSection] = useState("");
  const [level, setLevel] = useState<"top" | "second">("top");
  const entity = entities.find((e) => e.id === entityId);
  const sectionDefs = type === "ASSET" ? ASSET_SECTIONS : type === "LIABILITY" ? LIABILITY_SECTIONS : null;
  const effectiveSection = sectionDefs ? (sectionDefs.some((d) => d.key === section) ? section : sectionDefs[0].key) : "";
  // A second-level account sits under a top-level account of the same entity and type (and, for assets and
  // liabilities, of the same section: a fixed asset's accumulated amortization goes under that fixed asset).
  const mine = options.filter((o) => o.entityId === entityId);
  const parents = parentChoices({ id: "__new__", parentId: null, type, section: effectiveSection || null, bank: false, code: "", label: "" } as unknown as AccountOption, mine);
  const pathOf = (o: AccountOption): string => {
    const up = o.parentId ? mine.find((x) => x.id === o.parentId) : null;
    return up ? `${pathOf(up)} › ${fr ? o.labelFr.split(" › ").pop() : o.label.split(" › ").pop()}` : fr ? (o.nameFr ?? o.name) : o.name;
  };
  return (
    <Grid>
      <F label={fr ? "Entité" : "Entity"}>
        <select name="entityId" value={entityId} onChange={(e) => setEntityId(e.target.value)} className={FIELD_CLASS}>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      </F>
      <F label="Code"><input name="code" required placeholder="8800" className={FIELD_CLASS} /></F>
      <F label={fr ? "Description anglaise" : "English description"}><input name="name" required className={FIELD_CLASS} /></F>
      <F label={fr ? "Description française" : "French description"}><input name="nameFr" className={FIELD_CLASS} /></F>
      <F label={fr ? "Type" : "Type"}>
        <select name="type" value={type} onChange={(e) => { setType(e.target.value); setLevel("top"); }} className={FIELD_CLASS}>
          <option value="EXPENSE">{fr ? "Dépense" : "Expense"}</option>
          <option value="INCOME">{fr ? "Revenu" : "Income"}</option>
          <option value="ASSET">{fr ? "Actif" : "Asset"}</option>
          <option value="LIABILITY">{fr ? "Passif" : "Liability"}</option>
          <option value="EQUITY">{fr ? "Capitaux propres" : "Equity"}</option>
        </select>
      </F>
      {sectionDefs && (
        <F label={fr ? "Section du bilan" : "Balance-sheet section"}>
          <select name="section" value={effectiveSection} onChange={(e) => setSection(e.target.value)} className={FIELD_CLASS}>
            {sectionDefs.map((d) => <option key={d.key} value={d.key}>{d[lang]}</option>)}
          </select>
        </F>
      )}
      <F label={fr ? "Niveau" : "Level"}>
        <select value={level} onChange={(e) => setLevel(e.target.value as "top" | "second")} className={FIELD_CLASS}>
          <option value="top">{fr ? "Premier niveau" : "Top level"}</option>
          <option value="second" disabled={parents.length === 0}>{fr ? "Sous un compte (sous-niveau)" : "Under an account (sub-level)"}</option>
        </select>
      </F>
      {level === "second" && parents.length > 0 && (
        <F label={fr ? "Sous le compte" : "Under"}>
          <select name="parentId" required className={FIELD_CLASS}>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.code} {pathOf(p)}</option>)}
          </select>
        </F>
      )}
      <F label={fr ? "Ligne d'impôt" : "Tax line"}><input name="taxLine" className={FIELD_CLASS} /></F>
      {entity && usesGifi(entity.kind, entity.country) && <F label="GIFI"><input name="gifi" maxLength={4} className={FIELD_CLASS} /></F>}
    </Grid>
  );
}
