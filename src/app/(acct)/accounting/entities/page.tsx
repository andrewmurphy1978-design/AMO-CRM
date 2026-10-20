import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { entityCardColor, loadBooks, KIND_LABEL } from "@/lib/accounting/options";
import Card, { type CardColor } from "@/components/section-card";
import EditEntityDialog from "./edit-entity-dialog";
import { TAX_NUMBER_TYPES } from "@/lib/accounting/tax-numbers";
import AddEntityDialog from "./add-entity-dialog";
import { requireAccountingUser } from "../session";

export default async function EntitiesPage() {
  const me = await requireAccountingUser();
  const lang = await getLang();
  const fr = lang === "fr";
  const books = await withScopedPrismaClient(async (db) => {
    await ensureAccountingSetup(db, me);
    return loadBooks(db, me.id);
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-soft">
          {fr
            ? "Chaque entité a ses propres livres (actifs, passifs, capitaux propres, revenus, dépenses). Les transactions entre entités passent par des comptes inter-entités / prêt d'actionnaire, comme un comptable le ferait. La couleur indique le personnel, la province ou le pays."
            : "Each entity has its own books (assets, liabilities, equity, income, expenses). Money between entities goes through inter-entity / shareholder-loan accounts, the way an accountant would do it. The colour shows personal, province or country."}
        </p>
        {me.admin && <AddEntityDialog lang={lang} />}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {books.entities.map((e) => (
          <Card
            key={e.id}
            color={entityCardColor(e) as CardColor}
            title={<>{e.name} <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold normal-case">{KIND_LABEL[e.kind]?.[lang] ?? e.kind} · {e.country}{e.province ? `-${e.province}` : ""}</span></>}
            actions={<EditEntityDialog lang={lang} entity={e} color={entityCardColor(e) as CardColor} />}
          >
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs uppercase text-soft">{fr ? "Méthode comptable" : "Accounting basis"}</dt><dd className="text-ink">{e.basis === "CASH" ? (fr ? "Caisse" : "Cash") : fr ? "Exercice" : "Accrual"}</dd></div>
              <div><dt className="text-xs uppercase text-soft">{fr ? "Fin d'exercice" : "Year-end"}</dt><dd className="text-ink">{new Date(Date.UTC(2000, e.fiscalYearEndMonth - 1, 1)).toLocaleString(fr ? "fr-CA" : "en-CA", { month: "long", timeZone: "UTC" })}</dd></div>
              <div><dt className="text-xs uppercase text-soft">{fr ? "Devise" : "Currency"}</dt><dd className="text-ink">{e.currency}</dd></div>
              <div><dt className="text-xs uppercase text-soft">{fr ? "Taxes de vente" : "Sales taxes"}</dt><dd className="text-ink">{e.salesTaxRegistered ? (fr ? "Inscrite" : "Registered") : fr ? "Non inscrite" : "Not registered"}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase text-soft">{fr ? "Numéros d'inscription" : "Registration numbers"}</dt>
                <dd className="text-ink">
                  {e.taxNumbers.length === 0 ? <span className="text-soft">—</span> : e.taxNumbers.map((t, i) => <span key={i} className="mr-3 inline-block">{TAX_NUMBER_TYPES[t.type]?.[lang].split(" (")[0]}{t.region ? ` ${t.region}` : ""}: <b>{t.number}</b></span>)}
                </dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
