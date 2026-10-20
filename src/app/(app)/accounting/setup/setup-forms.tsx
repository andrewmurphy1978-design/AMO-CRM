"use client";

import { addAccount, addBankAccount, addEntity, updateEntity } from "@/actions/accounting";
import { useState } from "react";
import { REGISTERED_TYPES, ASSET_SECTIONS, LIABILITY_SECTIONS, usesGifi } from "@/lib/accounting/charts";
import ActionForm, { CurrencyField, Field, inputCls } from "../action-form";
import TaxNumbersField from "./tax-numbers-field";
import type { AccountOption, EntityInfo } from "@/lib/accounting/options";

type Lang = "en" | "fr";

export function AddEntityForm({ lang }: { lang: Lang }) {
  const fr = lang === "fr";
  return (
    <ActionForm action={addEntity} submitLabel={fr ? "Créer" : "Create"}>
      <Field label={fr ? "Nom" : "Name"}><input name="name" required className={inputCls} /></Field>
      <Field label={fr ? "Type" : "Type"}>
        <select name="kind" className={inputCls} defaultValue="CORPORATION">
          <option value="CORPORATION">{fr ? "Société par actions (Canada)" : "Corporation (Canada)"}</option>
          <option value="LLC">{fr ? "LLC américaine" : "US LLC"}</option>
          <option value="SOLE_PROPRIETORSHIP">{fr ? "Entreprise individuelle" : "Sole proprietorship"}</option>
        </select>
      </Field>
      <Field label={fr ? "Province / État" : "Province / State"}><input name="province" placeholder="QC" className={`${inputCls} w-24`} /></Field>
      <Field label={fr ? "Fin d'exercice (mois)" : "Year-end month"}><input name="fiscalYearEndMonth" type="number" min={1} max={12} defaultValue={12} className={`${inputCls} w-20`} /></Field>
      <TaxNumbersField lang={lang} country="CA" initial={[]} note />
      <label className="flex items-center gap-2 pb-2 text-soft"><input type="checkbox" name="salesTaxRegistered" /> {fr ? "Inscrite aux taxes de vente" : "Registered for sales tax"}</label>
    </ActionForm>
  );
}

export function EditEntityForm({ entity, lang }: { entity: EntityInfo; lang: Lang }) {
  const fr = lang === "fr";
  return (
    <ActionForm action={updateEntity.bind(null, entity.id)} submitLabel={fr ? "Enregistrer" : "Save"}>
      <Field label={fr ? "Nom" : "Name"}><input name="name" defaultValue={entity.name} className={inputCls} /></Field>
      <Field label={fr ? "Province / État" : "Province / State"}><input name="province" defaultValue={entity.province ?? ""} className={`${inputCls} w-24`} /></Field>
      <Field label={fr ? "Méthode" : "Basis"}>
        <select name="basis" defaultValue={entity.basis} className={inputCls}>
          <option value="CASH">{fr ? "Caisse" : "Cash"}</option>
          <option value="ACCRUAL">{fr ? "Exercice (comptabilité d'engagement)" : "Accrual"}</option>
        </select>
      </Field>
      <Field label={fr ? "Fin d'exercice (mois)" : "Year-end month"}><input name="fiscalYearEndMonth" type="number" min={1} max={12} defaultValue={entity.fiscalYearEndMonth} className={`${inputCls} w-20`} /></Field>
      <TaxNumbersField lang={lang} country={entity.country} initial={entity.taxNumbers} />
      <label className="flex items-center gap-2 pb-2 text-soft"><input type="checkbox" name="salesTaxRegistered" defaultChecked={entity.salesTaxRegistered} /> {fr ? "Inscrite aux taxes de vente" : "Registered for sales tax"}</label>
    </ActionForm>
  );
}

export function AddBankForm({ lang, entities }: { lang: Lang; entities: EntityInfo[] }) {
  const fr = lang === "fr";
  return (
    <ActionForm action={addBankAccount} submitLabel={fr ? "Ajouter" : "Add"}>
      <Field label={fr ? "Appartient à" : "Belongs to"}>
        <select name="entityId" className={inputCls}>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      </Field>
      <Field label={fr ? "Nom du compte" : "Account name"}><input name="name" required placeholder="Desjardins chequing" className={inputCls} /></Field>
      <Field label={fr ? "Nom en français" : "French name"}><input name="nameFr" placeholder="Desjardins chèques" className={inputCls} /></Field>
      <Field label={fr ? "Type" : "Type"}>
        <select name="kind" className={inputCls}>
          <option value="CHEQUING">{fr ? "Compte chèques" : "Chequing"}</option>
          <option value="SAVINGS">{fr ? "Épargne" : "Savings"}</option>
          <option value="CREDIT_CARD">{fr ? "Carte de crédit" : "Credit card"}</option>
          {Object.entries(REGISTERED_TYPES).map(([k, v]) => <option key={k} value={k}>{v[lang]}</option>)}
        </select>
      </Field>
      <Field label={fr ? "Institution" : "Institution"}><input name="institution" className={inputCls} /></Field>
      <Field label={fr ? "4 derniers chiffres" : "Last 4 digits"}><input name="last4" maxLength={4} className={`${inputCls} w-24`} /></Field>
      <CurrencyField label={fr ? "Devise" : "Currency"} />
      <label className="flex items-center gap-2 pb-2 text-soft"><input type="checkbox" name="invertSign" /> {fr ? "Inverser les signes à l'import" : "Invert signs on import"}</label>
    </ActionForm>
  );
}

export function AddAccountForm({ lang, entities, options, defaultEntityId }: { lang: Lang; entities: EntityInfo[]; options: AccountOption[]; defaultEntityId?: string }) {
  const fr = lang === "fr";
  const [entityId, setEntityId] = useState(defaultEntityId ?? entities[0]?.id ?? "");
  const [type, setType] = useState("EXPENSE");
  const [section, setSection] = useState("");
  const [level, setLevel] = useState<"top" | "second">("top");
  const entity = entities.find((e) => e.id === entityId);
  const sectionDefs = type === "ASSET" ? ASSET_SECTIONS : type === "LIABILITY" ? LIABILITY_SECTIONS : null;
  const effectiveSection = sectionDefs ? (sectionDefs.some((d) => d.key === section) ? section : sectionDefs[0].key) : "";
  // A second-level account sits under a top-level account of the same entity and type (and, for assets and
  // liabilities, of the same section: a fixed asset's accumulated amortization goes under that fixed asset).
  const parents = options.filter((o) => o.entityId === entityId && o.type === type && !o.parentId && !o.bank && (!sectionDefs || o.section === effectiveSection));
  return (
    <ActionForm action={addAccount} submitLabel={fr ? "Ajouter" : "Add"}>
      <Field label={fr ? "Entité" : "Entity"}>
        <select name="entityId" value={entityId} onChange={(e) => setEntityId(e.target.value)} className={inputCls}>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      </Field>
      <Field label="Code"><input name="code" required placeholder="8800" className={`${inputCls} w-24`} /></Field>
      <Field label={fr ? "Description anglaise" : "English description"}><input name="name" required className={`${inputCls} w-52`} /></Field>
      <Field label={fr ? "Description française" : "French description"}><input name="nameFr" className={`${inputCls} w-52`} /></Field>
      <Field label={fr ? "Type" : "Type"}>
        <select name="type" value={type} onChange={(e) => { setType(e.target.value); setLevel("top"); }} className={inputCls}>
          <option value="EXPENSE">{fr ? "Dépense" : "Expense"}</option>
          <option value="INCOME">{fr ? "Revenu" : "Income"}</option>
          <option value="ASSET">{fr ? "Actif" : "Asset"}</option>
          <option value="LIABILITY">{fr ? "Passif" : "Liability"}</option>
          <option value="EQUITY">{fr ? "Capitaux propres" : "Equity"}</option>
        </select>
      </Field>
      {sectionDefs && (
        <Field label={fr ? "Section du bilan" : "Balance-sheet section"}>
          <select name="section" value={effectiveSection} onChange={(e) => setSection(e.target.value)} className={inputCls}>
            {sectionDefs.map((d) => <option key={d.key} value={d.key}>{d[lang]}</option>)}
          </select>
        </Field>
      )}
      <Field label={fr ? "Niveau" : "Level"}>
        <select value={level} onChange={(e) => setLevel(e.target.value as "top" | "second")} className={inputCls}>
          <option value="top">{fr ? "Premier niveau" : "Top level"}</option>
          <option value="second" disabled={parents.length === 0}>{fr ? "Deuxième niveau (sous un compte)" : "Second level (under an account)"}</option>
        </select>
      </Field>
      {level === "second" && parents.length > 0 && (
        <Field label={fr ? "Sous le compte" : "Under"}>
          <select name="parentId" required className={inputCls}>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.code} {fr ? p.labelFr : p.label}</option>)}
          </select>
        </Field>
      )}
      <Field label={fr ? "Ligne d'impôt" : "Tax line"}><input name="taxLine" className={`${inputCls} w-28`} /></Field>
      {entity && usesGifi(entity.kind, entity.country) && <Field label="GIFI"><input name="gifi" maxLength={4} className={`${inputCls} w-20`} /></Field>}
    </ActionForm>
  );
}
