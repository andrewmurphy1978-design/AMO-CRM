import { withScopedPrismaClient } from "@/lib/prisma";
import { requireAccountingUser } from "../session";
import Card, { type CardColor } from "@/components/section-card";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { entityCardColor, loadBooks } from "@/lib/accounting/options";
import BankRow from "./bank-row";
import DeleteRuleButton from "./delete-rule-button";
import { ASSET_SECTIONS, LIABILITY_SECTIONS, REGISTERED_TYPES, usesGifi } from "@/lib/accounting/charts";
import AddBankDialog from "./add-bank-dialog";
import AddAccountDialog from "./add-account-dialog";
import EntityTabs from "./entity-tabs";
import SetupLayout, { type SetupSection } from "./setup-layout";
import { flatten, parentChoices as parentChoicesOf } from "@/lib/accounting/tree";
import AccountEditor, { AccountColumnsHeader } from "./account-editor";

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

  const banksSection = (
    <EntityTabs
      tabs={books.entities.map((e) => {
        const mine = banks.filter((b) => b.entityId === e.id);
        return {
          id: e.id,
          label: e.name,
          sub: String(mine.length),
          content: (
            <div className="space-y-4">
              <p className="text-sm text-soft">
                {fr
                  ? "Comptes chèques, épargne, cartes de crédit, CELI, REER, CELIAPP, REEE, comptes de placement, CRI, FERR et FRV : tous peuvent recevoir des relevés importés."
                  : "Chequing, savings, credit cards, TFSA, RRSP, FHSA, RESP, investment accounts, LIRA, RRIF and LIF: all can receive imported statements."}
              </p>
              {(["bank", "registered"] as const).map((group) => {
                const list = mine.filter((b) => (group === "registered" ? !!b.registeredType : !b.registeredType));
                return (
                  <Card
                    key={group}
                    color={group === "registered" ? "calendarEvents" : (entityCardColor(e) as CardColor)}
                    title={<>{group === "registered" ? (fr ? "Comptes enregistrés et de placement" : "Registered & investment accounts") : fr ? "Comptes bancaires et cartes de crédit" : "Bank accounts & credit cards"} <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{list.length}</span></>}
                    actions={<AddBankDialog lang={lang} entities={books.entities} entityId={e.id} color={group === "registered" ? "calendarEvents" : (entityCardColor(e) as CardColor)} kindGroup={group} />}
                  >
                    {group === "registered" && (
                      <p className="text-xs text-soft">
                        {fr
                          ? "CELI, REER, CELIAPP, REEE, comptes de placement, CRI, FERR, FRV : des actifs à long terme, rangés sous leur compte du plan comptable. Chacun reçoit des relevés comme un compte bancaire. Le solde du relevé inclut le rendement du marché : enregistrez-le dans Rapprochement."
                          : "TFSA, RRSP, FHSA, RESP, investment accounts, LIRA, RRIF, LIF: long-term assets, filed under their own chart account. Each takes statements like a bank account. The statement balance includes market gains: record them in Reconcile."}
                      </p>
                    )}
                    <ul className="divide-y divide-card-border text-sm">
                      {list.length === 0 && <li className="py-2 text-soft">{fr ? "Aucun compte : utilisez le + pour en ajouter un." : "No accounts yet: use the + to add one."}</li>}
                      {list.map((b) => (
                        <BankRow
                          key={b.id}
                          lang={lang}
                          color={group === "registered" ? "calendarEvents" : (entityCardColor(e) as CardColor)}
                          bank={{ id: b.id, name: b.name, nameFr: b.nameFr, institution: b.institution, last4: b.last4, inverted: b.importSign === -1, card: b.subtype === "CREDIT_CARD", entityName: e.name, code: b.code, txCount: txCounts.get(b.id) ?? 0, currency: b.currency ?? e.currency, registeredLabel: b.registeredType ? REGISTERED_TYPES[b.registeredType]?.[lang].split(" (")[0] : undefined }}
                        />
                      ))}
                    </ul>
                    {group === "bank" && (
                      <p className="text-xs text-soft">
                        {e.kind === "PERSONAL"
                          ? fr
                            ? "Un compte personnel peut aussi servir à l'entreprise individuelle : importez-le ici, puis choisissez l'entreprise comme catégorie (ou répartissez 60/40) ; les écritures de transfert avec le propriétaire sont créées automatiquement."
                            : "A personal account can also be used for the sole proprietorship: import it here, then pick the business as the category (or split 60/40) — the owner contribution / draw entries are created automatically."
                          : fr
                            ? "Les comptes de cette entité reçoivent leurs propres relevés ; un virement vers un autre de vos comptes est reconnu comme transfert."
                            : "This entity's accounts take their own statements; a payment to another of your accounts is recognized as a transfer."}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          ),
        };
      })}
    />
  );

  const chartIntro = (kind: string, country: string, l: "en" | "fr") => {
    const sections =
      l === "fr"
        ? "Les actifs se répartissent en trésorerie, actifs à court terme, à long terme, immobilisations et actifs incorporels ; les passifs en court et long terme ; les revenus et dépenses peuvent avoir des sous-catégories."
        : "Assets split into treasury, other current, long-term, fixed and intangible assets; liabilities into short-term and long-term; income and expenses can have sub-categories.";
    const first =
      kind === "PERSONAL"
        ? l === "fr" ? "Plan comptable personnel créé automatiquement (références aux lignes de la déclaration T1)." : "Personal chart created automatically (references to the T1 return lines)."
        : kind === "SOLE_PROPRIETORSHIP"
          ? l === "fr" ? "Plan comptable de l'entreprise individuelle créé automatiquement (lignes du formulaire T2125 et codes IGRF)." : "Sole-proprietorship chart created automatically (T2125 lines and GIFI codes)."
          : kind === "CORPORATION"
            ? l === "fr" ? "Plan comptable de la société créé automatiquement (codes IGRF/GIFI de l'annexe 100 et 125)." : "Corporation chart created automatically (GIFI codes, Schedules 100 and 125)."
            : country === "US"
              ? l === "fr" ? "Plan comptable de la LLC créé automatiquement (lignes de l'annexe C)." : "LLC chart created automatically (Schedule C lines)."
              : l === "fr" ? "Plan comptable créé automatiquement." : "Chart created automatically.";
    return `${first} ${sections}`;
  };
  const CARD_OF: Record<string, CardColor> = { ASSET: "contact", LIABILITY: "addresses", EQUITY: "personal", INCOME: "marketingActive", EXPENSE: "projects" };
  const chartSection = (
    <>
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
              <div className="space-y-4">
<p className="text-sm text-soft">{chartIntro(e.kind, e.country, lang)}</p>
              {gifi && (
                <p className="text-xs text-soft">
                  {fr
                    ? "Codes GIFI (Indice général des renseignements financiers) suggérés automatiquement : vérifiez-les avec le guide RC4088 de l'ARC ou votre comptable, et corrigez-les au besoin."
                    : "GIFI codes (General Index of Financial Information) are suggested automatically: check them against the CRA's RC4088 guide or your accountant, and edit any."}
                </p>
              )}
              {TYPES.map((t) => {
                const list = own.filter((o) => o.type === t.key).sort((x, y) => x.code.localeCompare(y.code));
                const hasChildren = new Set(list.map((o) => o.parentId).filter(Boolean));
                const pathLabel = (o: (typeof list)[number]): string => {
                  const parent = o.parentId ? list.find((x) => x.id === o.parentId) : null;
                  const mine = fr ? (o.nameFr ?? o.name) : o.name;
                  return parent ? `${pathLabel(parent)} › ${mine}` : mine;
                };
                const renderRow = ({ o, depth }: { o: (typeof list)[number]; depth: number }) => (
                  <AccountEditor
                    key={o.id}
                    lang={lang}
                    showGifi={gifi}
                    depth={depth}
                    account={{ id: o.id, code: o.code, name: o.name, nameFr: o.nameFr ?? "", type: o.type, section: optionOf(o.id)?.section ?? null, parentId: o.parentId, gifi: o.gifi, hasChildren: hasChildren.has(o.id), isGroup: o.isGroup, bank: o.bank, parentChoices: parentChoicesOf(o, list).map((p) => ({ id: p.id, label: pathLabel(p) })) }}
                  />
                );
                // Assets and liabilities: grouped under their second-level section; an account whose section is changed moves there.
                const sectionDefs = t.key === "ASSET" ? ASSET_SECTIONS : t.key === "LIABILITY" ? LIABILITY_SECTIONS : null;
                // Equity is "Net worth" for the personal books.
                const title = t.key === "EQUITY" && e.kind === "PERSONAL" ? (fr ? "Avoir net" : "Net worth") : t[lang];
                return (
                  <Card
                    key={t.key}
                    color={CARD_OF[t.key]}
                    title={<>{title} <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{list.length}</span></>}
                    actions={<AddAccountDialog lang={lang} entities={books.entities} options={books.options} entityId={e.id} type={t.key} color={CARD_OF[t.key]} />}
                  >
                    {list.length === 0 && <p className="text-sm text-soft">{fr ? "Aucun compte." : "No accounts."}</p>}
                    {list.length > 0 && <AccountColumnsHeader lang={lang} showGifi={gifi} />}
                    {sectionDefs
                      ? sectionDefs.map((d) => {
                          const rows = flatten(list, list.filter((o) => !o.parentId && o.section === d.key));
                          if (rows.length === 0) return null;
                          return (
                            <div key={d.key}>
                              <p className="text-xs font-semibold uppercase tracking-wide text-soft">{d[lang]} <span className="font-normal">({rows.length})</span></p>
                              <div className="divide-y divide-card-border">{rows.map(renderRow)}</div>
                            </div>
                          );
                        })
                      : (
                        <div className="divide-y divide-card-border">
                          {flatten(list, list.filter((o) => !o.parentId)).map(renderRow)}
                        </div>
                      )}
                  </Card>
                );
              })}
              </div>
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
    { id: "banks", label: fr ? "Comptes bancaires" : "Bank accounts", count: banks.length, content: banksSection },
    { id: "chart", label: fr ? "Plan comptable" : "Chart of accounts", count: books.options.filter((o) => !o.bank).length, content: chartSection },
    { id: "suppliers", label: fr ? "Fournisseurs mémorisés" : "Remembered suppliers", count: rules.length, content: suppliersSection },
  ];
  return <SetupLayout sections={sections} />;
}
