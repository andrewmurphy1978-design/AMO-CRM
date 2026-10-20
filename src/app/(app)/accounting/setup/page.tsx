import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { loadBooks, KIND_LABEL } from "@/lib/accounting/options";
import { AddAccountForm, AddBankForm, AddEntityForm, EditEntityForm } from "./setup-forms";
import BankRow from "./bank-row";
import DeleteRuleButton from "./delete-rule-button";

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

  return (
    <div className="space-y-6">
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

      <section className={card}>
        <h2 className={h2}>{fr ? "Comptes bancaires et cartes" : "Bank accounts and cards"}</h2>
        {banks.length > 0 && (
          <ul className="divide-y divide-card-border text-sm">
            {banks.map((b) => (
              <BankRow
                key={b.id}
                lang={lang}
                bank={{ id: b.id, name: b.name, institution: b.institution, last4: b.last4, inverted: b.importSign === -1, card: b.subtype === "CREDIT_CARD", entityName: entityName.get(b.entityId) ?? "", code: b.code, txCount: txCounts.get(b.id) ?? 0, currency: b.currency ?? books.entities.find((e) => e.id === b.entityId)?.currency ?? "CAD" }}
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

      <section className={card}>
        <h2 className={h2}>{fr ? "Plan comptable" : "Chart of accounts"}</h2>
        <p className="text-sm text-soft">{fr ? "Les plans sont créés automatiquement (T2125 pour l'entreprise individuelle, GIFI pour les sociétés, Annexe C pour la LLC). Ajoutez un compte au besoin." : "Charts are created automatically (T2125 for the sole proprietorship, GIFI for corporations, Schedule C for the LLC). Add an account if you need one."}</p>
        <AddAccountForm lang={lang} entities={books.entities} />
        <details>
          <summary className="cursor-pointer text-sm text-soft">{fr ? "Voir tous les comptes" : "See all accounts"}</summary>
          <div className="mt-2 grid gap-4 lg:grid-cols-2">
            {books.entities.map((e) => (
              <div key={e.id}>
                <p className="text-sm font-semibold text-ink">{e.name}</p>
                <ul className="text-xs text-soft">
                  {books.options.filter((o) => o.entityId === e.id).sort((a, b) => a.code.localeCompare(b.code)).map((o) => (
                    <li key={o.id}>{o.code} · {fr && o.nameFr ? o.nameFr : o.name} <span className="opacity-60">({o.type.toLowerCase()})</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      </section>

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
    </div>
  );
}
