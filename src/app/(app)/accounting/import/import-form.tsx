"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { importStatement, readStatementPdf, suggestWithAI } from "@/actions/accounting";
import { detectColumns, parseCsv, toTransactions, type ColumnMap, type DateOrder } from "@/lib/accounting/csv";
import type { ImportRow } from "@/lib/accounting/ledger";
import { money } from "@/lib/accounting/format";

const none = -1;

export default function ImportForm({ lang, accounts }: { lang: "en" | "fr"; accounts: { id: string; label: string; card: boolean; currency: string; entityCurrency: string }[] }) {
  const fr = lang === "fr";
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [pdfRows, setPdfRows] = useState<ImportRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ rows: number; added: number; duplicates: number; autoPosted: number; transfersLinked: number } | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [rate, setRate] = useState("1");
  const [dragging, setDragging] = useState(false);
  const account = accounts.find((a) => a.id === accountId);
  const foreign = !!account && account.currency !== account.entityCurrency;

  const parsed = grid && map ? toTransactions(grid, headerRow, map) : null;
  const rows: ImportRow[] | null = pdfRows ?? parsed?.rows ?? null;

  const reset = () => {
    setGrid(null);
    setMap(null);
    setPdfRows(null);
    setNote(null);
    setError(null);
    setResult(null);
  };

  const onFile = (file: File | undefined) => {
    reset();
    if (!file) return;
    setFileName(file.name);
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result).split(",")[1] ?? "";
        startTransition(async () => {
          const r = await readStatementPdf(accountId, base64);
          if (r.error) setError(r.error);
          else {
            setPdfRows(r.rows ?? []);
            setNote(r.warning ?? null);
          }
        });
      };
      reader.readAsDataURL(file);
      return;
    }
    file.text().then((text) => {
      const g = parseCsv(text);
      const d = detectColumns(g);
      setGrid(g);
      setHeaders(d.headers);
      setHeaderRow(d.headerRow);
      setMap(d.map);
      if (!d.map) setError(fr ? "Colonnes non reconnues — choisissez-les ci-dessous." : "Could not detect the columns — choose them below.");
    });
  };

  const colOptions = (allowNone: boolean) => {
    const width = Math.max(0, ...(grid ?? []).slice(0, 20).map((r) => r.length));
    return (
      <>
        {allowNone && <option value={none}>—</option>}
        {Array.from({ length: width }, (_, i) => (
          <option key={i} value={i}>
            {headers[i] ? `${i + 1}. ${headers[i]}` : `${i + 1}`} {grid?.[headerRow + 1]?.[i] ? `(${grid[headerRow + 1][i].slice(0, 18)})` : ""}
          </option>
        ))}
      </>
    );
  };
  const patch = (p: Partial<ColumnMap>) => setMap((m) => ({ date: 0, description: 1, amount: null, debit: null, credit: null, dateOrder: "YMD", ...(m ?? {}), ...p }));
  const num = (v: string) => (Number(v) === none ? null : Number(v));

  const doImport = () =>
    startTransition(async () => {
      if (!rows) return;
      const r = await importStatement(accountId, rows, fileName, foreign ? Number(rate) || 1 : 1);
      if (r.error) setError(r.error);
      else {
        setError(null);
        setResult(r.counts ?? null);
        // Let the AI propose a category for everything the remembered suppliers did not already cover.
        setAiNote(fr ? "L'IA catégorise les nouvelles transactions…" : "The AI is categorizing the new transactions…");
        suggestWithAI().then((ai) => setAiNote(ai.error ? (fr ? `Suggestions IA impossibles : ${ai.error}` : `AI suggestions failed: ${ai.error}`) : ai.suggested ? (fr ? `${ai.suggested} transaction(s) ont une suggestion IA à confirmer.` : `${ai.suggested} transaction(s) have an AI suggestion to confirm.`) : null));
        setGrid(null);
        setMap(null);
        setPdfRows(null);
      }
    });

  return (
    <section className="space-y-4 rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <h2 className="font-display text-lg font-semibold text-ink">{fr ? "Importer un relevé" : "Import a statement"}</h2>
      <p className="text-sm text-soft">
        {fr
          ? "Déposez le CSV (ou le PDF) exporté de votre banque. Les doublons sont ignorés : vous pouvez réimporter des périodes qui se chevauchent."
          : "Upload the CSV (or PDF) exported from your bank. Duplicates are skipped, so overlapping periods can be imported again."}
      </p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? "Compte" : "Account"}</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded-lg border border-card-border bg-white px-2 py-1.5">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        {foreign && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-soft">{fr ? `Taux : 1 ${account.currency} = ? ${account.entityCurrency}` : `Rate: 1 ${account.currency} = ? ${account.entityCurrency}`}</span>
            <input type="number" step="0.0001" min="0" value={rate} onChange={(e) => setRate(e.target.value)} className="w-28 rounded-lg border border-card-border bg-white px-2 py-1.5" />
          </label>
        )}
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm ${dragging ? "border-emerald-500 bg-emerald-50" : "border-card-border bg-field-bg/40"}`}
      >
        <span className="font-medium text-ink">{fileName ? fileName : fr ? "Glissez-déposez votre relevé ici" : "Drag and drop your statement here"}</span>
        <span className="text-xs text-soft">{fr ? "ou cliquez pour choisir un fichier CSV / PDF" : "or click to choose a CSV / PDF file"}</span>
        <input type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>

      {busy && !rows && <p className="text-sm text-soft">{fr ? "Lecture en cours…" : "Reading…"}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>}

      {grid && (
        <div className="grid gap-3 rounded-lg border border-card-border bg-field-bg/40 p-3 text-sm sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-soft">{fr ? "Date" : "Date"}</span>
            <select value={map?.date ?? none} onChange={(e) => patch({ date: Number(e.target.value) })} className="rounded-lg border border-card-border bg-white px-2 py-1">{colOptions(false)}</select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-soft">{fr ? "Format de date" : "Date order"}</span>
            <select value={map?.dateOrder ?? "YMD"} onChange={(e) => patch({ dateOrder: e.target.value as DateOrder })} className="rounded-lg border border-card-border bg-white px-2 py-1">
              <option value="YMD">AAAA-MM-JJ / YYYY-MM-DD</option>
              <option value="DMY">JJ/MM/AAAA / DD/MM/YYYY</option>
              <option value="MDY">MM/JJ/AAAA / MM/DD/YYYY</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-soft">{fr ? "Description" : "Description"}</span>
            <select value={map?.description ?? none} onChange={(e) => patch({ description: Number(e.target.value) })} className="rounded-lg border border-card-border bg-white px-2 py-1">{colOptions(false)}</select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-soft">{fr ? "Nom / bénéficiaire" : "Name / payee"}</span>
            <select value={map?.name ?? none} onChange={(e) => patch({ name: num(e.target.value) })} className="rounded-lg border border-card-border bg-white px-2 py-1">{colOptions(true)}</select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-soft">{fr ? "Mémo / détails" : "Memo / details"}</span>
            <select value={map?.memo ?? none} onChange={(e) => patch({ memo: num(e.target.value) })} className="rounded-lg border border-card-border bg-white px-2 py-1">{colOptions(true)}</select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-soft">{fr ? "Type de transaction" : "Transaction type"}</span>
            <select value={map?.kind ?? none} onChange={(e) => patch({ kind: num(e.target.value) })} className="rounded-lg border border-card-border bg-white px-2 py-1">{colOptions(true)}</select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-soft">{fr ? "Montant (une colonne)" : "Amount (one column)"}</span>
            <select value={map?.amount ?? none} onChange={(e) => patch({ amount: num(e.target.value) })} className="rounded-lg border border-card-border bg-white px-2 py-1">{colOptions(true)}</select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-soft">{fr ? "Débit (sorties)" : "Debit (money out)"}</span>
            <select value={map?.debit ?? none} onChange={(e) => patch({ debit: num(e.target.value) })} className="rounded-lg border border-card-border bg-white px-2 py-1">{colOptions(true)}</select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-soft">{fr ? "Crédit (entrées)" : "Credit (money in)"}</span>
            <select value={map?.credit ?? none} onChange={(e) => patch({ credit: num(e.target.value) })} className="rounded-lg border border-card-border bg-white px-2 py-1">{colOptions(true)}</select>
          </label>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <b>{rows.length}</b> {fr ? "transactions lues" : "transactions read"}
            {parsed && parsed.skipped > 0 ? (fr ? ` (${parsed.skipped} lignes ignorées)` : ` (${parsed.skipped} lines skipped)`) : ""}. {fr ? "Aperçu :" : "Preview:"}
          </p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-card-border">
              {rows.slice(0, 8).map((r, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 whitespace-nowrap text-soft">{r.date}</td>
                  <td className="pr-3 text-ink">{r.description}</td>
                  <td className="text-right whitespace-nowrap text-ink">{money(r.amount, account?.currency ?? "CAD", lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-soft">
            {fr
              ? "Vérifiez que les dépenses sont négatives. Sinon, cochez « inverser les signes » dans la configuration du compte (fréquent pour les cartes de crédit)."
              : "Check that spending shows as negative. If not, turn on “invert signs” for the account in Setup (common for credit cards)."}
          </p>
          <button disabled={busy} onClick={doImport} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? "…" : fr ? `Importer ${rows.length} transactions` : `Import ${rows.length} transactions`}
          </button>
        </div>
      )}
      {rows && rows.length === 0 && !error && <p className="text-sm text-red-700">{fr ? "Aucune transaction trouvée." : "No transactions found."}</p>}

      {result && (
        <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">{fr ? "Importation terminée" : "Import complete"}</p>
          <ul className="mt-1 list-disc pl-5">
            <li>{result.added} {fr ? "nouvelles transactions" : "new transactions"} ({result.duplicates} {fr ? "doublons ignorés" : "duplicates skipped"})</li>
            <li>{result.autoPosted} {fr ? "catégorisées automatiquement (fournisseurs connus)" : "categorized automatically (known suppliers)"}</li>
            {result.transfersLinked > 0 && <li>{result.transfersLinked} {fr ? "virements entre vos comptes reliés" : "transfers between your accounts linked"}</li>}
          </ul>
          {aiNote && <p className="mt-2">{aiNote}</p>}
          <Link href="/accounting/transactions" className="mt-2 inline-block underline">{fr ? "Catégoriser maintenant →" : "Categorize now →"}</Link>
        </div>
      )}
    </section>
  );
}
