"use client";

import { useEffect, useState, useTransition } from "react";
import { listProjectDocuments, setItemDocumentLink, type LinkedItem, type ProjectDocuments } from "@/actions/document-links";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30 disabled:opacity-50";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

// The UI language from a dialog's own "Project" label (those dialogs get their labels, not a lang prop).
export const langFromProjectLabel = (label: string): "en" | "fr" => (/^projet/i.test(label.trim()) ? "fr" : "en");

// Once an email or a calendar event is linked to a project, it can also be linked to one of that
// project's proposals / invoices. These two selects save on their own (the link to the project
// must be saved first).
export default function DocumentLinkFields({ projectId, item, lang }: { projectId: string; item: LinkedItem; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const [docs, setDocs] = useState<ProjectDocuments | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listProjectDocuments(projectId, item)
      .then((d) => {
        if (!cancelled) setDocs(d);
      })
      .catch(() => {
        if (!cancelled) setMessage(fr ? "Impossible de charger les documents." : "Couldn't load the documents.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, item.type, item.id]);

  function change(kind: "proposal" | "invoice", docId: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await setItemDocumentLink(item, projectId, kind, docId);
      if (res.error) setMessage(fr ? "Enregistrez d'abord le lien avec le projet." : res.error);
      else setDocs((d) => (d ? { ...d, ...(kind === "proposal" ? { proposalId: docId } : { invoiceId: docId }) } : d));
    });
  }

  if (!docs) return message ? <p className="text-xs text-red-600">{message}</p> : <p className="text-xs text-soft">{fr ? "Chargement des soumissions et factures…" : "Loading proposals and invoices…"}</p>;
  if (docs.proposals.length === 0 && docs.invoices.length === 0) return null;
  return (
    <div className="space-y-3">
      <div>
        <label className={LABEL_CLASS}>{fr ? "Soumission" : "Proposal"}</label>
        <select value={docs.proposalId} disabled={pending || !docs.linkedToProject} onChange={(e) => change("proposal", e.target.value)} className={FIELD_CLASS}>
          <option value="">—</option>
          {docs.proposals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL_CLASS}>{fr ? "Facture" : "Invoice"}</label>
        <select value={docs.invoiceId} disabled={pending || !docs.linkedToProject} onChange={(e) => change("invoice", e.target.value)} className={FIELD_CLASS}>
          <option value="">—</option>
          {docs.invoices.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </div>
      {!docs.linkedToProject && <p className="text-xs text-soft">{fr ? "Enregistrez d'abord le lien avec le projet pour choisir une soumission ou une facture." : "Save the link to the project first to pick a proposal or an invoice."}</p>}
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}
