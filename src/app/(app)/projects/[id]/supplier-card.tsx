"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card, { CARD_COLORS } from "@/components/section-card";
import SectionDialog from "../../contacts/[id]/section-dialog";
import type { Lang } from "@/lib/i18n/dictionaries";
import { saveSupplierInvoice, deleteSupplierInvoice, MAX_SUPPLIER_FILE_BYTES } from "@/actions/supplier-invoices";

export interface SupplierRow {
  id: string;
  supplier: string;
  reference: string | null;
  description: string | null;
  invoiceDate: string | null; // yyyy-mm-dd
  paidDate: string | null;
  currency: string;
  subtotal: number;
  gstAmount: number;
  qstAmount: number;
  hstAmount: number;
  totalAmount: number;
  paymentMethod: string | null;
  reimbursable: boolean;
  reimbursementStatus: string;
  attachToProposal: boolean;
  notes: string | null;
  fileName: string | null;
  hasFile: boolean;
}

const FIELD = "mt-1 w-full min-w-0 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-soft";
const money = (n: number, cur: string) => `${n.toFixed(2)} ${cur}`;

const PILL: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  BILLED: "bg-sky-50 text-sky-700",
  REIMBURSED: "bg-emerald-50 text-emerald-700",
  ABSORBED: "bg-black/5 text-soft",
};

function SupplierDialog({ projectId, row, lang, onClose }: { projectId: string; row: SupplierRow | null; lang: Lang; onClose: () => void }) {
  const fr = lang === "fr";
  const router = useRouter();
  const [file, setFile] = useState<{ base64: string; name: string; mime: string } | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [amounts, setAmounts] = useState({ subtotal: row?.subtotal ?? 0, gst: row?.gstAmount ?? 0, qst: row?.qstAmount ?? 0, hst: row?.hstAmount ?? 0 });
  const [reimbursable, setReimbursable] = useState(row?.reimbursable ?? true);
  const total = amounts.subtotal + amounts.gst + amounts.qst + amounts.hst;

  async function pick(f: File | undefined) {
    if (!f) return;
    setFileError(null);
    if (f.size > MAX_SUPPLIER_FILE_BYTES) {
      setFileError(fr ? "Le fichier dépasse 4 Mo." : "The file is over 4 MB.");
      return;
    }
    const buf = new Uint8Array(await f.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    setFile({ base64: btoa(binary), name: f.name, mime: f.type || "application/octet-stream" });
    setRemoveFile(false);
  }

  return (
    <SectionDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          router.refresh();
        }
      }}
      title={row ? row.supplier : fr ? "Facture de fournisseur" : "Supplier invoice"}
      action={saveSupplierInvoice.bind(null, projectId, row?.id ?? null)}
      labels={{ cancel: fr ? "Annuler" : "Cancel", save: fr ? "Enregistrer" : "Save", saving: fr ? "Enregistrement…" : "Saving…" }}
      wide
      headerColorClassName={CARD_COLORS.purchases}
      headerExtra={
        row ? (
          <button
            type="button"
            onClick={async () => {
              if (!confirm(fr ? "Supprimer cette facture de fournisseur ?" : "Delete this supplier invoice?")) return;
              await deleteSupplierInvoice(row.id, projectId);
              onClose();
              router.refresh();
            }}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            {fr ? "Supprimer" : "Delete"}
          </button>
        ) : undefined
      }
    >
      <input type="hidden" name="fileBase64" value={file?.base64 ?? ""} />
      <input type="hidden" name="fileName" value={file?.name ?? ""} />
      <input type="hidden" name="fileMime" value={file?.mime ?? ""} />
      <input type="hidden" name="removeFile" value={removeFile ? "1" : ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL}>{fr ? "Fournisseur" : "Supplier"}</label>
          <input name="supplier" required defaultValue={row?.supplier} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>{fr ? "No de facture du fournisseur" : "Supplier invoice no."}</label>
          <input name="reference" defaultValue={row?.reference ?? ""} className={FIELD} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>{fr ? "Description (ce qui a été payé)" : "Description (what was paid for)"}</label>
          <textarea name="description" rows={2} defaultValue={row?.description ?? ""} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>{fr ? "Date de la facture" : "Invoice date"}</label>
          <input type="date" name="invoiceDate" defaultValue={row?.invoiceDate ?? ""} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>{fr ? "Date de paiement" : "Date paid"}</label>
          <input type="date" name="paidDate" defaultValue={row?.paidDate ?? ""} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>{fr ? "Montant avant taxes" : "Amount before tax"}</label>
          <input name="subtotal" type="number" step="0.01" min="0" value={amounts.subtotal} onChange={(e) => setAmounts({ ...amounts, subtotal: Number(e.target.value) })} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>{fr ? "Devise" : "Currency"}</label>
          <select name="currency" defaultValue={row?.currency ?? "CAD"} className={FIELD}>
            {["CAD", "USD", "EUR", "GBP"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <div>
            <label className={LABEL}>{fr ? "TPS" : "GST"}</label>
            <input name="gstAmount" type="number" step="0.01" min="0" value={amounts.gst} onChange={(e) => setAmounts({ ...amounts, gst: Number(e.target.value) })} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>{fr ? "TVQ" : "QST"}</label>
            <input name="qstAmount" type="number" step="0.01" min="0" value={amounts.qst} onChange={(e) => setAmounts({ ...amounts, qst: Number(e.target.value) })} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>{fr ? "TVH" : "HST"}</label>
            <input name="hstAmount" type="number" step="0.01" min="0" value={amounts.hst} onChange={(e) => setAmounts({ ...amounts, hst: Number(e.target.value) })} className={FIELD} />
          </div>
        </div>
        <p className="text-sm font-semibold text-ink sm:col-span-2">
          {fr ? "Total payé" : "Total paid"}: {total.toFixed(2)}
        </p>
        <div>
          <label className={LABEL}>{fr ? "Mode de paiement" : "Payment method"}</label>
          <input name="paymentMethod" defaultValue={row?.paymentMethod ?? ""} placeholder={fr ? "ex. carte de crédit" : "e.g. credit card"} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>{fr ? "Remboursement" : "Reimbursement"}</label>
          <select name="reimbursementStatus" defaultValue={row?.reimbursementStatus ?? "PENDING"} disabled={!reimbursable} className={FIELD}>
            <option value="PENDING">{fr ? "À facturer" : "To re-bill"}</option>
            <option value="BILLED">{fr ? "Facturé au client" : "Billed to client"}</option>
            <option value="REIMBURSED">{fr ? "Remboursé" : "Reimbursed"}</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="reimbursable" checked={reimbursable} onChange={(e) => setReimbursable(e.target.checked)} />
          {fr ? "Remboursable par le client (sinon : coût absorbé)" : "Reimbursable by the client (otherwise: our cost)"}
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="attachToProposal" defaultChecked={row?.attachToProposal ?? true} />
          {fr ? "Joindre à la proposition / à la prochaine facture" : "Include in the proposal / next invoice"}
        </label>
        <div className="sm:col-span-2">
          <label className={LABEL}>{fr ? "Fichier de la facture (PDF ou image, 4 Mo max)" : "Invoice file (PDF or image, 4 MB max)"}</label>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => pick(e.target.files?.[0])} className="text-sm" />
            {!file && row?.hasFile && !removeFile && (
              <span className="text-xs text-soft">
                📎 {row.fileName}{" "}
                <a href={`/api/projects/${projectId}/supplier-invoices/${row.id}/file`} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                  {fr ? "ouvrir" : "open"}
                </a>{" "}
                <button type="button" onClick={() => setRemoveFile(true)} className="text-red-600 hover:underline">
                  {fr ? "retirer" : "remove"}
                </button>
              </span>
            )}
          </div>
          {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>{fr ? "Notes" : "Notes"}</label>
          <textarea name="notes" rows={2} defaultValue={row?.notes ?? ""} className={FIELD} />
        </div>
      </div>
    </SectionDialog>
  );
}

export default function SupplierCard({ projectId, rows, lang }: { projectId: string; rows: SupplierRow[]; lang: Lang }) {
  const fr = lang === "fr";
  const [dialog, setDialog] = useState<{ row: SupplierRow | null; key: number } | null>(null);
  const statusLabel: Record<string, string> = {
    PENDING: fr ? "À facturer" : "To re-bill",
    BILLED: fr ? "Facturé" : "Billed",
    REIMBURSED: fr ? "Remboursé" : "Reimbursed",
    ABSORBED: fr ? "Absorbé" : "Our cost",
  };

  const cur = rows[0]?.currency ?? "CAD";
  const paid = rows.reduce((a, r) => a + r.totalAmount, 0);
  const toRecover = rows.filter((r) => r.reimbursable && r.reimbursementStatus !== "REIMBURSED").reduce((a, r) => a + r.totalAmount, 0);
  const recovered = rows.filter((r) => r.reimbursementStatus === "REIMBURSED").reduce((a, r) => a + r.totalAmount, 0);
  const taxes = rows.reduce((a, r) => a + r.gstAmount + r.qstAmount + r.hstAmount, 0);

  return (
    <Card
      color="purchases"
      title={
        <>
          {fr ? "Fournisseurs" : "Suppliers"}
          {rows.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{rows.length}</span>}
        </>
      }
      compact
      actions={
        <button
          type="button"
          title={fr ? "Ajouter une facture de fournisseur" : "Add a supplier invoice"}
          aria-label={fr ? "Ajouter une facture de fournisseur" : "Add a supplier invoice"}
          onClick={() => setDialog({ row: null, key: Date.now() })}
          className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20"
        >
          +
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-soft">
          {fr ? "Aucune facture de fournisseur payée pour ce projet." : "No supplier invoices paid for this project yet."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-card-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 first:pt-0">
                <button type="button" onClick={() => setDialog({ row: r, key: Date.now() })} className="min-w-0 flex-1 text-left hover:underline">
                  <span className="block truncate text-sm font-medium text-ink">
                    {r.supplier}
                    {r.reference ? ` · #${r.reference}` : ""}
                  </span>
                  <span className="block truncate text-xs text-soft">{[r.paidDate, r.description].filter(Boolean).join(" · ")}</span>
                </button>
                {r.hasFile && (
                  <a href={`/api/projects/${projectId}/supplier-invoices/${r.id}/file`} target="_blank" rel="noreferrer" title={r.fileName ?? ""} className="text-sm" aria-label="Open file">
                    📎
                  </a>
                )}
                <span className="shrink-0 text-xs text-soft">{money(r.totalAmount, r.currency)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PILL[r.reimbursementStatus] ?? PILL.PENDING}`}>{statusLabel[r.reimbursementStatus] ?? r.reimbursementStatus}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-1 border-t border-card-border pt-2 text-xs sm:grid-cols-2">
            <span className="text-soft">
              {fr ? "Payé en leur nom" : "Paid on their behalf"}: <span className="font-semibold text-ink">{money(paid, cur)}</span>
            </span>
            <span className="text-soft">
              {fr ? "À récupérer" : "To recover"}: <span className="font-semibold text-ink">{money(toRecover, cur)}</span>
            </span>
            <span className="text-soft">
              {fr ? "Remboursé" : "Reimbursed"}: <span className="font-semibold text-ink">{money(recovered, cur)}</span>
            </span>
            <span className="text-soft">
              {fr ? "Taxes payées au fournisseur" : "Taxes paid to suppliers"}: <span className="font-semibold text-ink">{money(taxes, cur)}</span>
            </span>
          </div>
        </>
      )}
      {dialog && <SupplierDialog key={dialog.key} projectId={projectId} row={dialog.row} lang={lang} onClose={() => setDialog(null)} />}
    </Card>
  );
}
