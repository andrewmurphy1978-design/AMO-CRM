import Link from "next/link";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import DeleteBatchButton from "./delete-batch-button";
import type { ColumnMap } from "@/lib/accounting/csv";
import ImportForm from "./import-form";

export default async function ImportPage() {
  const lang = await getLang();
  const fr = lang === "fr";
  const { banks, batches } = await withScopedPrismaClient(async (db) => {
    await ensureAccountingSetup(db);
    const banks = await db.accAccount.findMany({ where: { subtype: { in: ["BANK", "CREDIT_CARD"] }, archived: false }, include: { entity: true }, orderBy: [{ entityId: "asc" }, { code: "asc" }] });
    const batches = await db.accImportBatch.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { account: true } });
    return { banks, batches };
  });
  return (
    <div className="space-y-6">
      {banks.length === 0 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          {fr ? "Ajoutez d'abord un compte bancaire ou une carte dans " : "First add a bank account or credit card in "}
          <Link href="/accounting/setup" className="underline">{fr ? "Configuration" : "Setup"}</Link>.
        </div>
      ) : (
        <ImportForm lang={lang} accounts={banks.map((b) => ({ id: b.id, label: `${b.entity.name} — ${fr && b.nameFr ? b.nameFr : b.name}${b.last4 ? ` ••${b.last4}` : ""}`, card: b.subtype === "CREDIT_CARD", currency: b.currency ?? b.entity.currency, entityCurrency: b.entity.currency, format: (b.importFormat as { signature: string; map: ColumnMap } | null) ?? null }))} />
      )}
      {batches.length > 0 && (
        <section className="rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-ink">{fr ? "Importations récentes" : "Recent imports"}</h2>
          <ul className="mt-2 divide-y divide-card-border text-sm">
            {batches.map((b) => (
              <li key={b.id} className="flex justify-between py-2">
                <span className="text-ink">{b.fileName} <span className="text-soft">· {b.account.name}</span></span>
                <span className="flex items-center gap-3 text-soft">{b.createdAt.toISOString().slice(0, 10)} <DeleteBatchButton id={b.id} label={fr ? "Supprimer" : "Delete"} confirmText={fr ? "Supprimer cette importation et ses transactions ?" : "Delete this import and its transactions?"} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
