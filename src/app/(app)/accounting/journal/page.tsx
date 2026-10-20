import { withScopedPrismaClient } from "@/lib/prisma";
import Card from "@/components/section-card";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { loadBooks } from "@/lib/accounting/options";
import { isoDate, money } from "@/lib/accounting/format";
import JournalForm from "./journal-form";
import DeleteEntryButton from "./delete-entry-button";

export default async function JournalPage() {
  const lang = await getLang();
  const fr = lang === "fr";
  const { books, entries } = await withScopedPrismaClient(async (db) => {
    await ensureAccountingSetup(db);
    const books = await loadBooks(db);
    const entries = await db.accJournalEntry.findMany({
      where: { source: { in: ["MANUAL", "OPENING"] } },
      orderBy: { date: "desc" },
      take: 100,
      include: { entity: true, lines: { include: { account: true } } },
    });
    return { books, entries };
  });
  return (
    <div className="space-y-6">
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
