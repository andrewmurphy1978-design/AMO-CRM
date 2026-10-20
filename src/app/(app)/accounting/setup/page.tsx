import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { loadBooks, KIND_LABEL } from "@/lib/accounting/options";
import { AddAccountForm, AddBankForm, AddEntityForm, EditEntityForm } from "./setup-forms";
import BankRow from "./bank-row";
import DeleteRuleButton from "./delete-rule-button";
import { usesGifi } from "@/lib/accounting/charts";
import SetupLayout, { type SetupSection } from "./setup-layout";
import AccountEditor from "./account-editor";

export default async function SetupPage() {
  const lang = await getLang();
  const fr = lang === "fr";
  const { books, rules, banks, entityName, txCounts } = await withScopedPrismaClient(async (db) => {
    await ensureAccountingSetup(db);
    const books = await loadBooks(db);
    const rules = await db.accRule.findMany({ orderBy: [{ hits: "desc" }, { pattern: "asc" }], take: 300 });
    const banks = await db.accAccount.findMany({ where: { subtype: { in: ["BANK", "CREDIT_CARD"] } }, orderBy: [{ entityId: "asc" }, { code: "asc" }] });
    const counts = await db.accTransaction.groupBy({ by: ["accountId"], _count: { _all: true } });
    return { books, rules, banks, entityName: new Map(books.entities.map((e) => [e.id, e.name])), txCounts: new Map(counts.map((c) => [c.accountId, c._count._all])) };
  });
  const accName = new Map(books.options.map((o) => [o.id, o.name]));
  const card = "space-y-3 rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm";
  const h2 = "font-display text-lg font-semibold text-ink";
  const TYPES: { key: string; en: string; fr: string }[] = [
    { key: "ASSET", en: "Assets", fr: "Actifs" },
    { key: "LIABILITY", en: "Liabilities", fr: "Passifs" },
    { key: "EQUITY", en: "Equity", fr: "Capitaux propres" },
    { key: "INCOME", en: "Income", fr: "Revenus" },
    { key: "EXPENSE", en: "Expenses", fr: "Dépenses" },
  ];

  const entitiesSection = (
    <section className={card}>
      <h2 className={h2}>{fr ? "Entités" : "Entities"}</h2>
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
    </section>
  );

  const banksSection = (
    <section className={card}>
      <h2 className={h2}>{fr ? "Comptes bancaires et cartes" : "Bank accounts and cards"}</h2>
      {banks.length > 0 && (
        <ul className="divide-y divide-card-border text-sm">
          {banks.map((b) => (
            <BankRow
              key={b.id}
              lang={lang}
              bank={{ id: b.id, name: b.name, nameFr: b.nameFr, institution: b.institution, last4: b.last4, inverted: b.importSign === -1, card: b.subtype === "CREDIT_CARD", entityName: entityName.get(b.entityId) ?? "", code: b.code, txCount: txCounts.get(b.id) ?? 0, currency: b.currency ?? books.entities.find((e) => e.id === b.entityId)?.currency ?? "CAD" }}
            />
          ))}
        </ul>
      )}
      <p className="text-xs text-soft">
        {fr
          ? "Un compte personnel peut aussi servir à l'entreprise individuelle : importez-le sous « Personnel », puis choisissez l'entreprise comme catégorie (ou répartissez 60/40) ; les écritures de transfert avec le propriétaire sont créées automatiquement."
          : "A personal account can also be used for the sole proprietorship: import it under Personal, then pick the business as the category (or split 60/40) — the owner contribution / draw entries are created automatically."}
      </p>
      <AddBankForm lang={lang} entities={books.entities} />
    </section>
  );

  const chartSection = (
    <>
      <section className={card}>
        <h2 className={h2}>{fr ? "Ajouter un compte" : "Add an account"}</h2>
        <p className="text-sm text-soft">
          {fr
            ? "Les plans comptables sont créés automatiquement (T2125 pour l'entreprise individuelle, GIFI pour les sociétés, Annexe C pour la LLC). Les actifs se répartissent en trésorerie, actifs à court terme, à long terme, immobilisations et actifs incorporels ; les passifs en court et long terme ; les revenus et dépenses peuvent avoir des sous-catégories."
            : "Charts are created automatically (T2125 for the sole proprietorship, GIFI for corporations, Schedule C for the LLC). Assets split into treasury, other current, long-term, fixed and intangible assets; liabilities into short-term and long-term; income and expenses can have sub-categories."}
        </p>
        <AddAccountForm lang={lang} entities={books.entities} options={books.options} />
      </section>
      {books.entities.map((e) => {
        const gifi = usesGifi(e.kind, e.country);
        const own = books.options.filter((o) => o.entityId === e.id && !o.bank);
        return (
          <section key={e.id} className={card}>
            <h2 className={h2}>{e.name}</h2>
            {gifi && (
              <p className="text-xs text-soft">
                {fr
                  ? "Codes GIFI (Indice général des renseignements financiers) suggérés d'après les annexes 100 et 125 : vérifiez-les avec le guide RC4088 de l'ARC ou votre comptable, et corrigez-les au besoin."
                  : "GIFI codes (General Index of Financial Information) are suggested from Schedules 100 and 125: check them against the CRA's RC4088 guide or your accountant, and edit any."}
              </p>
            )}
            {TYPES.map((t) => {
              const list = own.filter((o) => o.type === t.key).sort((x, y) => x.code.localeCompare(y.code));
              if (list.length === 0) return null;
              const parents = list.filter((o) => !o.parentId);
              const ordered = parents.flatMap((p) => [p, ...list.filter((c) => c.parentId === p.id)]);
              const hasChildren = new Set(list.map((o) => o.parentId).filter(Boolean));
              return (
                <div key={t.key}>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-soft">{t[lang]}</p>
                  <div className="divide-y divide-card-border">
                    {ordered.map((o) => (
                      <AccountEditor
                        key={o.id}
                        lang={lang}
                        showGifi={gifi}
                        account={{ id: o.id, code: o.code, name: fr && o.nameFr ? o.nameFr : o.name, type: o.type, section: books.options.find((x) => x.id === o.id)?.section ?? null, parentId: o.parentId, gifi: o.gifi, hasChildren: hasChildren.has(o.id), bank: false, parentChoices: parents.filter((p) => p.id !== o.id).map((p) => ({ id: p.id, label: fr && p.nameFr ? p.nameFr : p.name })) }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );

  const suppliersSection = (
    <section className={card}>
      <h2 className={h2}>{fr ? "Fournisseurs mémorisés" : "Remembered suppliers"} <span className="text-sm font-normal text-soft">({rules.length})</span></h2>
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
    </section>
  );

  const sections: SetupSection[] = [
    { id: "entities", label: fr ? "Entités" : "Entities", count: books.entities.length, content: entitiesSection },
    { id: "banks", label: fr ? "Comptes bancaires" : "Bank accounts", count: banks.length, content: banksSection },
    { id: "chart", label: fr ? "Plan comptable" : "Chart of accounts", count: books.options.filter((o) => !o.bank).length, content: chartSection },
    { id: "suppliers", label: fr ? "Fournisseurs mémorisés" : "Remembered suppliers", count: rules.length, content: suppliersSection },
  ];
  return <SetupLayout sections={sections} />;
}
