import { withScopedPrismaClient } from "@/lib/prisma";
import { requireAccountingUser } from "../session";
import Card from "@/components/section-card";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { loadBooks, KIND_LABEL } from "@/lib/accounting/options";
import { AddAccountForm, AddBankForm, AddEntityForm, EditEntityForm } from "./setup-forms";
import BankRow from "./bank-row";
import DeleteRuleButton from "./delete-rule-button";
import { ASSET_SECTIONS, LIABILITY_SECTIONS, REGISTERED_TYPES, usesGifi } from "@/lib/accounting/charts";
import EntityTabs from "./entity-tabs";
import SetupLayout, { type SetupSection } from "./setup-layout";
import AccountEditor from "./account-editor";

export default async function SetupPage() {
  const me = await requireAccountingUser();
  const lang = await getLang();
  const fr = lang === "fr";
  const { books, rules, banks, entityName, txCounts } = await withScopedPrismaClient(async (db) => {
    await ensureAccountingSetup(db, me);
    const books = await loadBooks(db, me.id);
    const rules = await db.accRule.findMany({ where: { ownerId: me.id }, orderBy: [{ hits: "desc" }, { pattern: "asc" }], take: 300 });
    const banks = await db.accAccount.findMany({ where: { subtype: { in: ["BANK", "CREDIT_CARD"] }, entity: { ownerId: me.id } }, orderBy: [{ entityId: "asc" }, { code: "asc" }] });
    const counts = await db.accTransaction.groupBy({ by: ["accountId"], where: { account: { entity: { ownerId: me.id } } }, _count: { _all: true } });
    return { books, rules, banks, entityName: new Map(books.entities.map((e) => [e.id, e.name])), txCounts: new Map(counts.map((c) => [c.accountId, c._count._all])) };
  });
  const accName = new Map(books.options.map((o) => [o.id, o.name]));
  const TYPES: { key: string; en: string; fr: string }[] = [
    { key: "ASSET", en: "Assets", fr: "Actifs" },
    { key: "LIABILITY", en: "Liabilities", fr: "Passifs" },
    { key: "EQUITY", en: "Equity", fr: "Capitaux propres" },
    { key: "INCOME", en: "Income", fr: "Revenus" },
    { key: "EXPENSE", en: "Expenses", fr: "Dépenses" },
  ];

  const entitiesSection = (
    <Card color="general" title={<>{fr ? "Entités" : "Entities"} <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{books.entities.length}</span></>}>
      <p className="text-sm text-soft">
        {fr
          ? "Chaque entité a ses propres livres (actifs, passifs, capitaux propres, revenus, dépenses). Les transactions entre entités passent par des comptes inter-entités / prêt d'actionnaire, comme un comptable le ferait."
          : "Each entity has its own books (assets, liabilities, equity, income, expenses). Money between entities goes through inter-entity / shareholder-loan accounts, the way an accountant would do it."}
      </p>
      {books.entities.map((e) => (
        <div key={e.id} className="space-y-2 rounded-lg border border-card-border p-3">
          <p className="text-sm font-semibold text-ink">{e.name} <span className="font-normal text-soft">· {KIND_LABEL[e.kind]?.[lang] ?? e.kind} · {e.country}</span></p>
          <EditEntityForm entity={e} lang={lang} />
        </div>
      ))}
      <details className="rounded-lg border border-card-border p-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">{fr ? "+ Ajouter une société / LLC" : "+ Add a corporation / LLC"}</summary>
        <div className="mt-3"><AddEntityForm lang={lang} /></div>
      </details>
    </Card>
  );

  const banksSection = (
    <Card color="contact" title={<>{fr ? "Comptes bancaires, cartes et comptes enregistrés" : "Bank accounts, cards and registered accounts"} <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{banks.length}</span></>}>
      <p className="text-xs text-soft">
        {fr
          ? "Comptes chèques, épargne, cartes de crédit, CELI, REER, CELIAPP, REEE, comptes de placement, CRI, FERR et FRV : tous peuvent recevoir des relevés importés."
          : "Chequing, savings, credit cards, TFSA, RRSP, FHSA, RESP, investment accounts, LIRA, RRIF and LIF: all can receive imported statements."}
      </p>
      <EntityTabs
        tabs={books.entities.map((e) => ({
          id: e.id,
          label: e.name,
          sub: String(banks.filter((b) => b.entityId === e.id).length),
          content: (
            <ul className="divide-y divide-card-border text-sm">
              {banks.filter((b) => b.entityId === e.id).length === 0 && <li className="py-2 text-soft">{fr ? "Aucun compte pour cette entité." : "No accounts for this entity yet."}</li>}
              {banks.filter((b) => b.entityId === e.id).map((b) => (
                <BankRow
                  key={b.id}
                  lang={lang}
                  bank={{ id: b.id, name: b.name, nameFr: b.nameFr, institution: b.institution, last4: b.last4, inverted: b.importSign === -1, card: b.subtype === "CREDIT_CARD", entityName: entityName.get(b.entityId) ?? "", code: b.code, txCount: txCounts.get(b.id) ?? 0, currency: b.currency ?? e.currency, registeredLabel: b.registeredType ? REGISTERED_TYPES[b.registeredType]?.[lang].split(" (")[0] : undefined }}
                />
              ))}
            </ul>
          ),
        }))}
      />
      <p className="text-xs text-soft">
        {fr
          ? "Un compte personnel peut aussi servir à l'entreprise individuelle : importez-le sous « Personnel », puis choisissez l'entreprise comme catégorie (ou répartissez 60/40) ; les écritures de transfert avec le propriétaire sont créées automatiquement. Pour un compte de placement, le solde du relevé inclut le rendement du marché : enregistrez-le dans Journal pour rapprocher."
          : "A personal account can also be used for the sole proprietorship: import it under Personal, then pick the business as the category (or split 60/40) — the owner contribution / draw entries are created automatically. For an investment account, the statement balance includes market gains: record them in Journal to reconcile."}
      </p>
      <AddBankForm lang={lang} entities={books.entities} />
    </Card>
  );

  const chartSection = (
    <>
      <p className="text-sm text-soft">
          {fr
            ? "Les plans comptables sont créés automatiquement (T2125 pour l'entreprise individuelle, GIFI pour les sociétés, Annexe C pour la LLC). Les actifs se répartissent en trésorerie, actifs à court terme, à long terme, immobilisations et actifs incorporels ; les passifs en court et long terme ; les revenus et dépenses peuvent avoir des sous-catégories."
            : "Charts are created automatically (T2125 for the sole proprietorship, GIFI for corporations, Schedule C for the LLC). Assets split into treasury, other current, long-term, fixed and intangible assets; liabilities into short-term and long-term; income and expenses can have sub-categories."}
        </p>
      <EntityTabs
        tabs={books.entities.map((e) => {
          const gifi = usesGifi(e.kind, e.country);
          const own = books.options.filter((o) => o.entityId === e.id);
          const optionOf = (id: string) => books.options.find((x) => x.id === id);
          return {
            id: e.id,
            label: e.name,
            sub: String(own.length),
            content: (
              <>
              <Card color="other" title={fr ? "Ajouter un compte" : "Add an account"}>
                <AddAccountForm key={e.id} lang={lang} entities={books.entities} options={books.options} defaultEntityId={e.id} />
              </Card>
              <Card color="statistics" title={<>{e.name} <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{own.length}</span></>}>
                {gifi && (
                  <p className="text-xs text-soft">
                    {fr
                      ? "Codes GIFI (Indice général des renseignements financiers) suggérés automatiquement : vérifiez-les avec le guide RC4088 de l'ARC ou votre comptable, et corrigez-les au besoin."
                      : "GIFI codes (General Index of Financial Information) are suggested automatically: check them against the CRA's RC4088 guide or your accountant, and edit any."}
                  </p>
                )}
                {TYPES.map((t) => {
                  const list = own.filter((o) => o.type === t.key).sort((x, y) => x.code.localeCompare(y.code));
                  if (list.length === 0) return null;
                  const parents = list.filter((o) => !o.parentId && !o.bank);
                  const hasChildren = new Set(list.map((o) => o.parentId).filter(Boolean));
                  const renderRow = (o: (typeof list)[number]) => (
                    <AccountEditor
                      key={o.id}
                      lang={lang}
                      showGifi={gifi}
                      account={{ id: o.id, code: o.code, name: o.name, nameFr: o.nameFr ?? "", type: o.type, section: optionOf(o.id)?.section ?? null, parentId: o.parentId, gifi: o.gifi, hasChildren: hasChildren.has(o.id), bank: o.bank, parentChoices: parents.filter((p) => p.id !== o.id).map((p) => ({ id: p.id, label: fr ? (p.nameFr ?? p.name) : p.name })) }}
                    />
                  );
                  // Assets and liabilities: grouped under their second-level section; an account whose section is changed moves there.
                  const sectionDefs = t.key === "ASSET" ? ASSET_SECTIONS : t.key === "LIABILITY" ? LIABILITY_SECTIONS : null;
                  return (
                    <div key={t.key} className="space-y-1">
                      <p className="mt-3 border-b border-card-border pb-1 text-sm font-semibold uppercase tracking-wide text-ink">{t[lang]}</p>
                      {sectionDefs
                        ? sectionDefs.map((d) => {
                            const inSection = list.filter((o) => !o.parentId && o.section === d.key);
                            const rows = inSection.flatMap((p) => [p, ...list.filter((c) => c.parentId === p.id)]);
                            if (rows.length === 0) return null;
                            return (
                              <div key={d.key} className="pl-3">
                                <p className="mt-2 text-xs font-semibold text-soft">{d[lang]} <span className="font-normal">({rows.length})</span></p>
                                <div className="divide-y divide-card-border">{rows.map(renderRow)}</div>
                              </div>
                            );
                          })
                        : (
                          <div className="divide-y divide-card-border pl-3">
                            {parents.flatMap((p) => [p, ...list.filter((c) => c.parentId === p.id)]).map(renderRow)}
                          </div>
                        )}
                    </div>
                  );
                })}
              </Card>
              </>
            ),
          };
        })}
      />
    </>
  );

  const suppliersSection = (
    <Card color="proposals" title={<>{fr ? "Fournisseurs mémorisés" : "Remembered suppliers"} <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{rules.length}</span></>}>
      {rules.length === 0 ? (
        <p className="text-sm text-soft">{fr ? "Aucun pour l'instant : ils apparaissent quand vous catégorisez avec « mémoriser »." : "None yet: they appear when you categorize with “remember” on."}</p>
      ) : (
        <ul className="divide-y divide-card-border text-sm">
          {rules.map((r) => {
            const al = (r.allocations as { entityId: string; accountId: string; pct: number }[]) ?? [];
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate text-ink">{r.pattern} <span className="text-soft">→ {al.map((a) => `${entityName.get(a.entityId) ?? ""} › ${accName.get(a.accountId) ?? "?"}${al.length > 1 ? ` ${a.pct}%` : ""}`).join(" + ")}</span></span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-soft">{r.hits}× <DeleteRuleButton id={r.id} label={fr ? "Oublier" : "Forget"} /></span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  const sections: SetupSection[] = [
    { id: "entities", label: fr ? "Entités" : "Entities", count: books.entities.length, content: entitiesSection },
    { id: "banks", label: fr ? "Comptes bancaires" : "Bank accounts", count: banks.length, content: banksSection },
    { id: "chart", label: fr ? "Plan comptable" : "Chart of accounts", count: books.options.filter((o) => !o.bank).length, content: chartSection },
    { id: "suppliers", label: fr ? "Fournisseurs mémorisés" : "Remembered suppliers", count: rules.length, content: suppliersSection },
  ];
  return <SetupLayout sections={sections} />;
}
