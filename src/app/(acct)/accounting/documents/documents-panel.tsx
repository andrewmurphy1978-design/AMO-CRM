"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/section-card";
import { scanInvoicesNow, candidatesForDocument, attachDocument, dismissDocument, detachDocument, type DocumentCandidate } from "@/actions/accounting";
import { money } from "@/lib/accounting/format";
import { openDocument } from "../transactions/tx-documents";

export interface WaitingDoc { id: string; filename: string; vendor: string | null; docDate: string | null; amount: number | null; currency: string | null; subject: string | null; fromLabel: string | null; invoiceNumber: string | null }
export interface AttachedDoc { id: string; filename: string; vendor: string | null; docDate: string | null; amount: number | null; currency: string | null; subject: string | null; txLabel: string }

export default function DocumentsPanel({ lang, waiting, attached }: { lang: "en" | "fr"; waiting: WaitingDoc[]; attached: AttachedDoc[] }) {
  const fr = lang === "fr";
  const router = useRouter();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState("");
  const [cands, setCands] = useState<Record<string, DocumentCandidate[]>>({});
  const [pick, setPick] = useState<Record<string, string>>({});

  const view = (id: string) => void openDocument(id).then((e) => e && setMessage(e));
  const check = () =>
    start(async () => {
      setMessage("");
      const r = await scanInvoicesNow();
      if (r.error) return setMessage(r.error);
      const s = r.scan;
      setMessage(
        fr
          ? `${s?.messages ?? 0} courriel(s) lu(s), ${s?.documents ?? 0} facture(s) trouvée(s), ${(s?.attached ?? 0) + (r.matchedLater ?? 0)} associée(s) à une transaction.${s?.errors.length ? ` (${s.errors[0]})` : ""}`
          : `${s?.messages ?? 0} email(s) read, ${s?.documents ?? 0} invoice(s) found, ${(s?.attached ?? 0) + (r.matchedLater ?? 0)} matched to a transaction.${s?.errors.length ? ` (${s.errors[0]})` : ""}`
      );
      router.refresh();
    });
  const find = (id: string) =>
    start(async () => {
      const list = await candidatesForDocument(id);
      setCands((c) => ({ ...c, [id]: list }));
      if (list.length === 0) setMessage(fr ? "Aucune transaction avec ce montant pour le moment. Elle sera associée automatiquement à la prochaine importation." : "No transaction with that amount yet. It will be matched automatically on the next import.");
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-card-border bg-card-bg p-4 text-sm shadow-sm">
        <p className="min-w-64 flex-1 text-soft">
          {fr
            ? "Les factures et reçus reçus par courriel (votre Gmail et les boîtes partagées auxquelles vous avez accès) sont lus automatiquement toutes les 15 minutes et attachés à la transaction correspondante. S'il n'y en a pas encore, ils attendent ici jusqu'à la prochaine importation."
            : "Invoices and receipts that arrive by email (your Gmail and the shared mailboxes you can open) are read automatically every 15 minutes and attached to the matching transaction. If there is none yet, they wait here until the next import."}
        </p>
        <button type="button" disabled={busy} onClick={check} className="btn-primary rounded-lg px-4 py-1.5 font-semibold disabled:opacity-50">
          {busy ? "…" : fr ? "Vérifier les courriels maintenant" : "Check email now"}
        </button>
      </div>
      {message && <p className="rounded-lg bg-black/5 px-3 py-2 text-sm text-ink">{message}</p>}

      <Card color="marketingPending" title={<>{fr ? "En attente d'une transaction" : "Waiting for a transaction"} <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{waiting.length}</span></>}>
        {waiting.length === 0 ? (
          <p className="mt-3 text-sm text-soft">{fr ? "Aucune facture en attente." : "No invoice is waiting."}</p>
        ) : (
          <ul className="mt-3 divide-y divide-card-border">
            {waiting.map((d) => (
              <li key={d.id} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-56 flex-1">
                    <button type="button" data-readonly-ok onClick={() => view(d.id)} className="font-medium text-ink underline">{d.vendor || d.filename}</button>
                    <p className="text-xs text-soft break-words">{d.filename}{d.invoiceNumber ? ` · #${d.invoiceNumber}` : ""}{d.subject ? ` · ${d.subject}` : ""}</p>
                  </div>
                  <span className="w-24 shrink-0 text-soft">{d.docDate ?? "—"}</span>
                  <span className="w-28 shrink-0 text-right font-semibold text-ink">{d.amount != null ? money(-d.amount, d.currency ?? "CAD", lang) : "—"}</span>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy} onClick={() => find(d.id)} className="rounded-lg border border-card-border px-3 py-1.5 hover:bg-black/5">{fr ? "Trouver la transaction" : "Find the transaction"}</button>
                    <button type="button" disabled={busy} onClick={() => start(async () => { await dismissDocument(d.id); router.refresh(); })} className="rounded-lg border border-card-border px-3 py-1.5 text-soft hover:bg-black/5">{fr ? "Ignorer" : "Dismiss"}</button>
                  </div>
                </div>
                {cands[d.id]?.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={pick[d.id] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [d.id]: e.target.value }))} className="rounded-lg border border-card-border bg-white px-2 py-1.5">
                      <option value="">{fr ? "— Choisir la transaction —" : "— Choose the transaction —"}</option>
                      {cands[d.id].map((c) => <option key={c.id} value={c.id}>{c.date} · {c.supplier} · {money(c.amount, d.currency ?? "CAD", lang)}{c.exact ? " ✓" : ""}</option>)}
                    </select>
                    <button type="button" disabled={busy || !pick[d.id]} onClick={() => start(async () => { await attachDocument(d.id, pick[d.id]); router.refresh(); })} className="btn-primary rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">{fr ? "Attacher" : "Attach"}</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card color="marketingActive" title={<>{fr ? "Attachées automatiquement (récentes)" : "Recently attached from email"} <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{attached.length}</span></>}>
        {attached.length === 0 ? (
          <p className="mt-3 text-sm text-soft">{fr ? "Rien pour le moment." : "Nothing yet."}</p>
        ) : (
          <ul className="mt-3 divide-y divide-card-border text-sm">
            {attached.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2">
                <button type="button" data-readonly-ok onClick={() => view(d.id)} className="min-w-48 flex-1 text-left text-ink underline">{d.vendor || d.filename}</button>
                <span className="min-w-48 flex-1 text-xs text-soft">→ {d.txLabel}</span>
                <span className="w-28 shrink-0 text-right text-ink">{d.amount != null ? money(-d.amount, d.currency ?? "CAD", lang) : ""}</span>
                <button type="button" disabled={busy} onClick={() => start(async () => { await detachDocument(d.id); router.refresh(); })} className="shrink-0 text-xs text-soft underline">{fr ? "Détacher" : "Detach"}</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
