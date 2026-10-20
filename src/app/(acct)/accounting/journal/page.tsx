import { withScopedPrismaClient } from "@/lib/prisma";
import { requireAccountingUser } from "../session";
import Card from "@/components/section-card";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { loadBooks } from "@/lib/accounting/options";
import { isoDate, money } from "@/lib/accounting/format";
import { ASSET_SECTIONS, LIABILITY_SECTIONS } from "@/lib/accounting/charts";
import EntityTabs from "../setup/entity-tabs";
import OpeningBalances, { type OpeningAccount } from "./opening-balances";
import JournalForm from "./journal-form";
import DeleteEntryButton from "./delete-entry-button";

export default async function JournalPage() {
  const me = await requireAccountingUser();
  const lang = await getLang();
  const fr = lang === "fr";
  const { books, entries, opening, openingDates } = await withScopedPrismaClient(async (db) => {
    await ensureAccountingSetup(db, me);
    const books = await loadBooks(db, me.id);
    const entries = await db.accJournalEntry.findMany({
      where: { source: { in: ["MANUAL", "OPENING"] }, entity: { ownerId: me.id } },
      orderBy: { date: "desc" },
      take: 100,
      include: { entity: true, lines: { include: { account: true } } },
    });
    // Current opening balance of each asset / liability account (normal-balance sign) and each entity's opening date.
    const lines = await db.accJournalLine.groupBy({ by: ["accountId"], where: { entry: { source: "OPENING", entity: { ownerId: me.id } } }, _sum: { debit: true, credit: true } });
    const opening = new Map(lines.map((l) => [l.accountId, { debit: l._sum.debit ?? 0, credit: l._sum.credit ?? 0 }]));
    const dated = await db.accJournalEntry.groupBy({ by: ["entityId"], where: { source: "OPENING", entity: { ownerId: me.id } }, _min: { date: true } });
    return { books, entries, opening, openingDates: new Map(dated.map((d) => [d.entityId, d._min.date])) };
  });
  const defaultDate = `${new Date().getUTCFullYear() - 1}-12-31`;
  const openingTabs = books.entities.map((e) => {
    const accounts: OpeningAccount[] = books.options
      .filter((o) => o.entityId === e.id && (o.type === "ASSET" || o.type === "LIABILITY") && !o.isGroup)
      .sort((a, b) => (a.type === b.type ? a.code.localeCompare(b.code) : a.type === "ASSET" ? -1 : 1))
      .map((o) => {
        const l = opening.get(o.id);
        const amount = l ? Math.round((o.type === "ASSET" ? l.debit - l.credit : l.credit - l.debit) * 100) / 100 : null;
        const defs = o.type === "ASSET" ? ASSET_SECTIONS : LIABILITY_SECTIONS;
        const sectionLabel = defs.find((d) => d.key === o.section)?.[lang] ?? "";
        return { id: o.id, code: o.code, label: fr ? o.labelFr : o.label, type: o.type as "ASSET" | "LIABILITY", sectionLabel, amount };
      });
    return {
      id: e.id,
      label: e.name,
      content: <OpeningBalances key={e.id} lang={lang} entityId={e.id} currency={e.currency} defaultDate={openingDates.get(e.id)?.toISOString().slice(0, 10) ?? defaultDate} accounts={accounts} />,
    };
  });
  return (
    <div className="space-y-6">
      <Card color="billing" title={fr ? "Soldes d'ouverture (actifs et passifs)" : "Opening balances (assets and liabilities)"}>
        <EntityTabs tabs={openingTabs} />
      </Card>
      <Card color="aiDetails" title={fr ? "Écriture manuelle" : "Manual entry"}>
        <p className="text-sm text-soft">
          {fr ? "Pour les soldes d'ouverture, l'amortissement, les corrections. Les débits doivent égaler les crédits." : "For opening balances, depreciation and corrections. Debits must equal credits."}
        </p>
        <JournalForm lang={lang} entities={books.entities} options={books.options} />
      </Card>
      <Card color="activity" title={<>{fr ? "Écritures manuelles" : "Manual entries"} <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{entries.length}</span></>}>
        {entries.length === 0 ? (
          <p className="text-sm text-soft">{fr ? "Aucune." : "None."}</p>
        ) : (
          <ul className="divide-y divide-card-border text-sm">
            {entries.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex justify-between">
                  <span className="text-ink">{isoDate(e.date)} · {e.entity.name} · {e.memo}{e.source === "OPENING" ? (fr ? " (ouverture)" : " (opening)") : ""}</span>
                  <DeleteEntryButton id={e.id} />
                </div>
                <ul className="pl-4 text-xs text-soft">
                  {e.lines.map((l) => (
                    <li key={l.id}>{l.account.code} {l.account.name}: {l.debit ? `Dr ${money(l.debit, e.entity.currency, lang)}` : `Cr ${money(l.credit, e.entity.currency, lang)}`}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
