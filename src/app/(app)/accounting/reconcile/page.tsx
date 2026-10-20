import Link from "next/link";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { ensureAccountingSetup } from "@/lib/accounting/ledger";
import { reconcileSummary } from "@/lib/accounting/reconcile";
import { isoDate } from "@/lib/accounting/format";
import ReconcilePanel from "./reconcile-panel";
import UnlockButton from "./unlock-button";

function monthOptions(): string[] {
  const now = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export default async function ReconcilePage({ searchParams }: { searchParams: Promise<{ account?: string; month?: string }> }) {
  const sp = await searchParams;
  const lang = await getLang();
  const fr = lang === "fr";
  const months = monthOptions();
  const month = sp.month && months.includes(sp.month) ? sp.month : months[1];

  const data = await withScopedPrismaClient(async (db) => {
    await ensureAccountingSetup(db);
    const banks = await db.accAccount.findMany({ where: { subtype: { in: ["BANK", "CREDIT_CARD"] }, archived: false }, include: { entity: true }, orderBy: [{ entityId: "asc" }, { code: "asc" }] });
    if (banks.length === 0) return { banks, summary: null, history: [] };
    const accountId = banks.find((b) => b.id === sp.account)?.id ?? banks[0].id;
    const summary = await reconcileSummary(db, accountId, month);
    const history = await db.accReconciliation.findMany({ where: { accountId }, orderBy: { periodEnd: "desc" }, take: 24 });
    return { banks, summary, history, accountId };
  });

  if (!data.summary) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        {fr ? "Ajoutez d'abord un compte bancaire dans " : "First add a bank account in "}
        <Link href="/accounting/setup" className="underline">{fr ? "Configuration" : "Setup"}</Link>.
      </div>
    );
  }
  const { banks, summary, history } = data;
  const accountId = data.accountId as string;
  const href = (over: { account?: string; month?: string }) => `/accounting/reconcile?account=${over.account ?? accountId}&month=${over.month ?? month}`;
  const latestId = history[0]?.id;

  return (
    <div className="space-y-6">
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-card-border bg-card-bg p-4 text-sm shadow-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? "Compte" : "Account"}</span>
          <select name="account" defaultValue={accountId} className="rounded-lg border border-card-border bg-white px-2 py-1.5">
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.entity.name} — {fr && b.nameFr ? b.nameFr : b.name}
                {b.last4 ? ` ••${b.last4}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? "Mois du relevé" : "Statement month"}</span>
          <select name="month" defaultValue={month} className="rounded-lg border border-card-border bg-white px-2 py-1.5">
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <button className="btn-primary rounded-lg px-4 py-1.5 font-semibold">{fr ? "Afficher" : "Show"}</button>
      </form>

      <ReconcilePanel
        key={`${accountId}-${month}`}
        lang={lang}
        month={month}
        summary={summary}
      />

      <section className="rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-ink">{fr ? "Mois rapprochés" : "Reconciled months"}</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-soft">{fr ? "Aucun pour l'instant." : "None yet."}</p>
        ) : (
          <ul className="mt-2 divide-y divide-card-border text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-1.5">
                <Link href={href({ month: isoDate(h.periodEnd).slice(0, 7) })} className="text-ink hover:underline">
                  ✓ {isoDate(h.periodEnd)} <span className="text-soft">· {fr ? "solde du relevé" : "statement balance"} {h.statementBalance.toFixed(2)}</span>
                </Link>
                {h.id === latestId && <UnlockButton id={h.id} label={fr ? "Déverrouiller" : "Unlock"} confirmText={fr ? "Déverrouiller ce mois ?" : "Unlock this month?"} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
