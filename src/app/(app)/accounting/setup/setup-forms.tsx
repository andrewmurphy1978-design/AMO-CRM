"use client";

import { addAccount, addBankAccount, addEntity, updateEntity } from "@/actions/accounting";
import ActionForm, { CurrencyField, Field, inputCls } from "../action-form";
import type { EntityInfo } from "@/lib/accounting/options";

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
      <Field label={fr ? "N° de taxes (TPS/TVQ)" : "Tax number (GST/QST)"}><input name="taxNumber" className={inputCls} /></Field>
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
      <Field label={fr ? "N° de taxes" : "Tax number"}><input name="taxNumber" defaultValue={entity.taxNumber ?? ""} className={inputCls} /></Field>
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
      <Field label={fr ? "Nom du compte" : "Account name"}><input name="name" required placeholder="Desjardins chèques" className={inputCls} /></Field>
      <Field label={fr ? "Type" : "Type"}>
        <select name="kind" className={inputCls}>
          <option value="CHEQUING">{fr ? "Compte chèques" : "Chequing"}</option>
          <option value="SAVINGS">{fr ? "Épargne" : "Savings"}</option>
          <option value="CREDIT_CARD">{fr ? "Carte de crédit" : "Credit card"}</option>
        </select>
      </Field>
      <Field label={fr ? "Institution" : "Institution"}><input name="institution" className={inputCls} /></Field>
      <Field label={fr ? "4 derniers chiffres" : "Last 4 digits"}><input name="last4" maxLength={4} className={`${inputCls} w-24`} /></Field>
      <CurrencyField label={fr ? "Devise" : "Currency"} />
      <label className="flex items-center gap-2 pb-2 text-soft"><input type="checkbox" name="invertSign" /> {fr ? "Inverser les signes à l'import" : "Invert signs on import"}</label>
    </ActionForm>
  );
}

export function AddAccountForm({ lang, entities }: { lang: Lang; entities: EntityInfo[] }) {
  const fr = lang === "fr";
  return (
    <ActionForm action={addAccount} submitLabel={fr ? "Ajouter" : "Add"}>
      <Field label={fr ? "Entité" : "Entity"}>
        <select name="entityId" className={inputCls}>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      </Field>
      <Field label="Code"><input name="code" required placeholder="8800" className={`${inputCls} w-24`} /></Field>
      <Field label={fr ? "Nom" : "Name"}><input name="name" required className={inputCls} /></Field>
      <Field label={fr ? "Type" : "Type"}>
        <select name="type" className={inputCls}>
          <option value="EXPENSE">{fr ? "Dépense" : "Expense"}</option>
          <option value="INCOME">{fr ? "Revenu" : "Income"}</option>
          <option value="ASSET">{fr ? "Actif" : "Asset"}</option>
          <option value="LIABILITY">{fr ? "Passif" : "Liability"}</option>
          <option value="EQUITY">{fr ? "Capitaux propres" : "Equity"}</option>
        </select>
      </Field>
      <Field label={fr ? "Ligne d'impôt" : "Tax line"}><input name="taxLine" className={`${inputCls} w-28`} /></Field>
    </ActionForm>
  );
}
