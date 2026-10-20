import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { loadBooks } from "@/lib/accounting/options";
import { isoDate } from "@/lib/accounting/format";
import TransactionsTable, { type TxRow } from "./transactions-table";

const PAGE = 300;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ account?: string; q?: string; year?: string; show?: string }> }) {
  const sp = await searchParams;
  const lang = await getLang();
  const year = sp.year ? Number(sp.year) : undefined;
  const q = sp.q?.trim();

  const data = await withScopedPrismaClient(async (db) => {
    const books = await loadBooks(db);
    const banks = await db.accAccount.findMany({ where: { subtype: { in: ["BANK", "CREDIT_CARD"] }, archived: false }, orderBy: { code: "asc" } });
    const base = {
      ...(sp.account ? { accountId: sp.account } : {}),
      ...(q ? { OR: [{ supplier: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}),
      ...(year ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } } : {}),
    };
    const [pending, done, doneCount] = await Promise.all([
      db.accTransaction.findMany({ where: { ...base, status: { in: ["NEW", "SUGGESTED"] } }, orderBy: [{ date: "desc" }, { id: "asc" }], take: 1000 }),
      db.accTransaction.findMany({
        where: { ...base, status: sp.show === "ignored" ? "IGNORED" : "POSTED" },
        orderBy: [{ date: "desc" }, { id: "asc" }],
        take: PAGE,
      }),
      db.accTransaction.count({ where: { ...base, status: sp.show === "ignored" ? "IGNORED" : "POSTED" } }),
    ]);
    const bankCur = new Map(banks.map((b) => [b.id, b.currency ?? books.entities.find((e) => e.id === b.entityId)?.currency ?? "CAD"]));
    const entCur = new Map(banks.map((b) => [b.id, books.entities.find((e) => e.id === b.entityId)?.currency ?? "CAD"]));
    const label = new Map<string, string>();
    for (const o of books.options) label.set(o.id, o.name);
    const entityName = new Map(books.entities.map((e) => [e.id, e.name]));
    const toRow = (t: (typeof pending)[number]): TxRow => {
      const alloc = (t.allocations as { entityId: string; accountId: string; pct?: number }[] | null) ?? [];
      const sug = (t.suggestion as { source?: string; allocations?: { entityId: string; accountId: string; pct?: number }[] } | null) ?? null;
      const describe = (list: { entityId: string; accountId: string; pct?: number }[]) =>
        list.map((a) => `${entityName.get(a.entityId) ?? ""} › ${label.get(a.accountId) ?? "?"}${list.length > 1 && a.pct ? ` (${a.pct}%)` : ""}`).join(" + ");
      return {
        id: t.id,
        date: isoDate(t.date),
        description: t.description,
        supplier: t.supplier,
        amount: t.amount,
        currency: bankCur.get(t.accountId) ?? "CAD",
        entityCurrency: entCur.get(t.accountId) ?? "CAD",
        fxRate: t.fxRate,
        accountId: t.accountId,
        status: t.status,
        by: t.categorizedBy,
        categoryText: alloc.length ? describe(alloc) : "",
        suggestionText: sug?.allocations?.length ? describe(sug.allocations) : "",
        suggestion: sug?.allocations ?? null,
      };
    };
    return { books, banks, pending: pending.map(toRow), done: done.map(toRow), doneCount };
  });

  return (
    <TransactionsTable
      lang={lang}
      entities={data.books.entities}
      options={data.books.options}
      banks={data.banks.map((b) => ({ id: b.id, name: (lang === "fr" && b.nameFr ? b.nameFr : b.name) + (b.last4 ? ` ••${b.last4}` : ""), entityId: b.entityId }))}
      pending={data.pending}
      done={data.done}
      doneCount={data.doneCount}
      filters={{ account: sp.account ?? "", q: q ?? "", year: sp.year ?? "", show: sp.show ?? "" }}
    />
  );
}
