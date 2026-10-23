"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, listTransactionDocuments, getDocumentFile, detachDocument, deleteDocument, type DocumentInfo } from "@/actions/accounting";

// Opens a document's file in a new tab (PDF or image) without a separate download route.
export async function openDocument(id: string): Promise<string | null> {
  const f = await getDocumentFile(id);
  if ("error" in f) return f.error;
  const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: f.mimeType }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return null;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** A paperclip on a transaction: shows its receipts / invoices and lets you add one. */
export default function TxDocuments({ txId, count, lang }: { txId: string; count: number; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<DocumentInfo[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();

  const load = () => start(async () => setDocs(await listTransactionDocuments(txId)));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
    else router.refresh();
  };
  const upload = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      setMessage("");
      const r = await uploadDocument(txId, { filename: file.name, mimeType: file.type || "application/pdf", base64: await readBase64(file) });
      if (r.error) setMessage(r.error);
      setDocs(await listTransactionDocuments(txId));
    });
  };

  return (
    <>
      <button
        type="button"
        data-readonly-ok
        onClick={toggle}
        title={fr ? "Reçus et factures" : "Receipts and invoices"}
        className={`rounded-lg border border-card-border px-2 py-1.5 text-sm hover:bg-black/5 ${count > 0 ? "text-emerald-700" : "text-soft"}`}
      >
        📎{count > 0 ? ` ${count}` : ""}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={toggle}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink">{fr ? "Reçus et factures" : "Receipts and invoices"}</h3>
              <button type="button" data-readonly-ok onClick={toggle} className="text-soft">✕</button>
            </div>
            {docs === null ? (
              <p className="text-sm text-soft">…</p>
            ) : docs.length === 0 ? (
              <p className="text-sm text-soft">{fr ? "Aucun document pour cette transaction." : "No document for this transaction yet."}</p>
            ) : (
              <ul className="divide-y divide-card-border text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 py-2">
                    <button type="button" data-readonly-ok className="min-w-0 flex-1 truncate text-left text-ink underline" onClick={() => void openDocument(d.id).then((e) => e && setMessage(e))}>
                      {d.filename}
                    </button>
                    <span className="shrink-0 text-xs text-soft">{d.source === "email" ? (fr ? "courriel" : "email") : (fr ? "ajouté" : "uploaded")}</span>
                    <button type="button" disabled={busy} className="shrink-0 text-xs text-soft underline" onClick={() => start(async () => { await detachDocument(d.id); setDocs(await listTransactionDocuments(txId)); })}>
                      {fr ? "Détacher" : "Detach"}
                    </button>
                    <button type="button" disabled={busy} className="shrink-0 text-xs text-red-600" onClick={() => { if (confirm(fr ? "Supprimer ce document ?" : "Delete this document?")) start(async () => { await deleteDocument(d.id); setDocs(await listTransactionDocuments(txId)); }); }}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="inline-block cursor-pointer rounded-lg border border-card-border px-3 py-1.5 text-sm text-ink hover:bg-black/5">
              {busy ? "…" : fr ? "+ Ajouter un fichier (PDF ou image)" : "+ Add a file (PDF or image)"}
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {message && <p className="text-sm text-red-600">{message}</p>}
          </div>
        </div>
      )}
    </>
  );
}
