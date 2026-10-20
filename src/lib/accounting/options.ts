import type { PrismaClient } from "@/lib/prisma";
import { defaultSection } from "./charts";
import { readTaxNumbers, type TaxNumber } from "./tax-numbers";

// What the pages and pickers need to know about the books: entities, and every account that can be chosen as
// the "other side" of a transaction (each grouped under its entity).

export interface EntityInfo {
  id: string;
  name: string;
  kind: string;
  country: string;
  province: string | null;
  currency: string;
  fiscalYearEndMonth: number;
  basis: string;
  salesTaxRegistered: boolean;
  taxNumber: string | null;
  taxNumbers: TaxNumber[];
}

export interface AccountOption {
  id: string;
  entityId: string;
  code: string;
  name: string;
  nameFr: string | null;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  subtype: string;
  section: string | null;
  parentId: string | null;
  gifi: string | null;
  // "Parent › Name" for a sub-category.
  label: string;
  labelFr: string;
  // The group heading in a picker.
  group: "EXPENSE" | "INCOME" | "TRANSFER" | "LIABILITY" | "ASSET" | "EQUITY";
  bank: boolean;
}

const GROUP_ORDER = ["EXPENSE", "INCOME", "TRANSFER", "LIABILITY", "ASSET", "EQUITY"] as const;

export async function loadBooks(db: PrismaClient, ownerId: string): Promise<{ entities: EntityInfo[]; options: AccountOption[] }> {
  const entities = await db.accEntity.findMany({ where: { archived: false, ownerId }, orderBy: { order: "asc" } });
  const accounts = await db.accAccount.findMany({ where: { archived: false, entityId: { in: entities.map((e) => e.id) } }, orderBy: [{ code: "asc" }] });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const options: AccountOption[] = accounts.map((a) => {
    const bank = a.subtype === "BANK" || a.subtype === "CREDIT_CARD";
    return {
      id: a.id,
      entityId: a.entityId,
      code: a.code,
      name: a.name,
      nameFr: a.nameFr,
      type: a.type,
      subtype: a.subtype,
      section: a.type === "ASSET" || a.type === "LIABILITY" ? (a.section ?? defaultSection(a.type, a.subtype)) : null,
      parentId: a.parentId,
      gifi: a.gifi,
      label: a.parentId && byId.get(a.parentId) ? `${byId.get(a.parentId)!.name} › ${a.name}` : a.name,
      labelFr: a.parentId && byId.get(a.parentId) ? `${byId.get(a.parentId)!.nameFr ?? byId.get(a.parentId)!.name} › ${a.nameFr ?? a.name}` : a.nameFr ?? a.name,
      bank,
      group: bank ? "TRANSFER" : a.type,
    };
  });
  options.sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group) || x.code.localeCompare(y.code));
  return {
    entities: entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind, country: e.country, province: e.province, currency: e.currency, fiscalYearEndMonth: e.fiscalYearEndMonth, basis: e.basis, salesTaxRegistered: e.salesTaxRegistered, taxNumber: e.taxNumber, taxNumbers: readTaxNumbers(e.taxNumbers, e.taxNumber, e.country) })),
    options,
  };
}

export const KIND_LABEL: Record<string, { en: string; fr: string }> = {
  PERSONAL: { en: "Personal", fr: "Personnel" },
  SOLE_PROPRIETORSHIP: { en: "Sole proprietorship", fr: "Entreprise individuelle" },
  CORPORATION: { en: "Corporation", fr: "Société par actions" },
  LLC: { en: "US LLC", fr: "LLC américaine" },
};

export const GROUP_LABEL: Record<AccountOption["group"], { en: string; fr: string }> = {
  EXPENSE: { en: "Expenses", fr: "Dépenses" },
  INCOME: { en: "Income", fr: "Revenus" },
  TRANSFER: { en: "Transfers to my accounts", fr: "Virements vers mes comptes" },
  LIABILITY: { en: "Liabilities", fr: "Passifs" },
  ASSET: { en: "Assets", fr: "Actifs" },
  EQUITY: { en: "Equity", fr: "Capitaux propres" },
};
