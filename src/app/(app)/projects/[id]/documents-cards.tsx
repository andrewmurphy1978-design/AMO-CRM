"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Card, { CARD_COLORS } from "@/components/section-card";
import type { EmailComposeLabels } from "../../email/email-compose-dialog";
import type { Lang } from "@/lib/i18n/dictionaries";
import {
  approveProposal,
  unapproveProposal,
  proposalSendInfo,
  markProposalSent,
  updateProposalStatus,
  deleteProposal,
  createFullProposal,
  updateFullProposal,
  attachSignedProposal,
  removeSignedProposal,
} from "@/actions/proposals";
import { createDraftInvoice, approveInvoice, unapproveInvoice, invoiceSendInfo, markInvoiceSent, updateInvoiceStatus, deleteInvoice, updateInvoiceLineItems } from "@/actions/invoices";
import ProposalForm from "./proposals/proposal-form";
import InvoiceLineItemsForm from "./invoices/invoice-line-items-form";
import SendDocumentButton from "./send-document-button";
import DocumentLinks, { type Linkables } from "./document-links";

type CatalogItem = { id: string; name: string; description: string | null; clientDescription?: string | null; projectType?: string | null; unitPrice: number; currency: string; unit: string | null };
type Line = { description: string; details?: string | null; quantity: number; unitPrice: number };
type Sub = { name: string; amount: number; period: string; note: string };

export interface ProposalRowData {
  id: string;
  title: string;
  status: string;
  currency: string;
  totalAmount: number;
  totalCad?: number | null;
  approvedAt: string | null;
  signedFileName?: string | null;
  sentAt: string | null;
  coverLetter: string | null;
  notes: string | null;
  lineItems: Line[];
  subscriptions: Sub[];
  paymentSchedule: { label: string; percentage: number | null; amount: number | null; dueDate: string | null }[];
}

export interface InvoiceRowData {
  id: string;
  number: string | null;
  status: string;
  currency: string;
  totalAmount: number;
  totalCad?: number | null;
  dueDate: string | null;
  approvedAt: string | null;
  notes: string | null;
  instalmentLabel: string | null;
  lineItems: Line[];
}

export interface EmailingProps {
  defaultComposeSource: string | null;
  intlLocale: string;
  hour12: boolean;
  emailComposeLabels: EmailComposeLabels;
}

const PILL: Record<string, string> = {
  DRAFT: "bg-black/5 text-soft",
  APPROVED: "bg-amber-50 text-amber-700",
  SENT: "bg-sky-50 text-sky-700",
  ACCEPTED: "bg-emerald-50 text-emerald-700",
  DECLINED: "bg-red-50 text-red-600",
  PAID: "bg-emerald-50 text-emerald-700",
  OVERDUE: "bg-amber-50 text-amber-700",
  CANCELED: "bg-red-50 text-red-600",
};

const BTN = "rounded-md border border-card-border px-2 py-1 text-xs font-medium text-ink hover:bg-black/5 disabled:opacity-50";

function Modal({ title, color, onClose, headerExtra, children }: { title: string; color: string; onClose: () => void; headerExtra?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className={`flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white ${color}`}>
          <h3 className="truncate font-display text-lg font-semibold">{title}</h3>
          <div className="flex items-center gap-2">
            {headerExtra}
            <button type="button" onClick={onClose} className="rounded-md bg-white/20 px-3 py-1.5 text-sm font-semibold hover:bg-white/30">
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function HeaderSave({ form, saving, label, savingLabel }: { form: string; saving: boolean; label: string; savingLabel: string }) {
  return (
    <button type="submit" form={form} disabled={saving} className="rounded-md bg-white/25 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/35 disabled:opacity-60">
      {saving ? savingLabel : label}
    </button>
  );
}

const money = (n: number, cur: string) => `${n.toFixed(2)} ${cur}`;

// The copy signed and returned by the client: attach it (PDF or image, 4 MB max),
// open it, or remove it.
function SignedCopy({ projectId, proposalId, fileName, fr }: { projectId: string; proposalId: string; fileName: string | null | undefined; fr: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > 4_000_000) return setError(fr ? "Le fichier dépasse 4 Mo." : "The file is over 4 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    startTransition(async () => {
      const res = await attachSignedProposal(proposalId, projectId, btoa(bin), file.name, file.type);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {fileName ? (
        <>
          <span className="text-soft">📎 {fr ? "Copie signée" : "Signed copy"}:</span>
          <a href={`/api/projects/${projectId}/proposals/${proposalId}/signed`} target="_blank" rel="noreferrer" className="max-w-[12rem] truncate text-emerald-700 hover:underline" title={fileName}>
            {fileName}
          </a>
          <button type="button" disabled={busy} onClick={() => startTransition(async () => { await removeSignedProposal(proposalId, projectId); router.refresh(); })} className="text-red-600 hover:underline">
            {fr ? "retirer" : "remove"}
          </button>
        </>
      ) : (
        <label className="cursor-pointer rounded-md border border-card-border px-2 py-1 font-medium text-ink hover:bg-black/5">
          {busy ? "…" : `📎 ${fr ? "Joindre la soumission signée" : "Attach signed proposal"}`}
          <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
      )}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ proposals

export function ProposalsCard({
  projectId,
  proposals,
  catalog,
  taxLocation,
  chargeCanadianTax,
  newDefaults,
  title,
  statusLabels,
  lang,
  emailing,
  linkables,
  projectType,
}: {
  projectId: string;
  proposals: ProposalRowData[];
  projectType?: string;
  catalog: CatalogItem[];
  taxLocation: { country: string | null; province: string | null };
  chargeCanadianTax: boolean;
  newDefaults: { title: string; currency: string; coverLetter: string; subscriptions: Sub[]; paymentSchedule: { label: string; percentage: number | null; amount: number | null; dueDate: string | null }[] };
  title: string;
  statusLabels: Record<string, string>;
  lang: Lang;
  emailing: EmailingProps;
  linkables: Linkables;
}) {
  const fr = lang === "fr";
  const router = useRouter();
  const [dialog, setDialog] = useState<{ id: string | null; key: number } | null>(null);
  const [linksFor, setLinksFor] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ id: string; issues: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const editing = dialog?.id ? proposals.find((p) => p.id === dialog.id) : undefined;

  return (
    <Card
      color="proposals"
      title={
        <>
          {title}
          {proposals.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{proposals.length}</span>}
        </>
      }
      compact
      actions={
        <button
          type="button"
          title={fr ? "Nouvelle proposition" : "New proposal"}
          aria-label={fr ? "Nouvelle proposition" : "New proposal"}
          onClick={() => setDialog({ id: null, key: Date.now() })}
          className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20"
        >
          +
        </button>
      }
    >
      {proposals.length === 0 ? (
        <p className="text-sm text-soft">—</p>
      ) : (
        <ul className="divide-y divide-card-border">
          {proposals.map((p) => (
            <li key={p.id} className="space-y-1.5 py-2 first:pt-0">
              <div className="flex items-center gap-2">
                {p.status === "DRAFT" ? (
                  <button type="button" onClick={() => setDialog({ id: p.id, key: Date.now() })} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:underline">
                    {p.title}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.title}</span>
                )}
                <span className="shrink-0 text-right text-xs text-soft">
                  {money(p.totalAmount, p.currency)}
                  {p.totalCad != null && <span className="block text-[10px]">≈ {money(p.totalCad, "CAD")}</span>}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PILL[p.status] ?? PILL.DRAFT}`}>{statusLabels[p.status] ?? p.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <a href={`/api/projects/${projectId}/proposals/${p.id}/pdf`} target="_blank" rel="noreferrer" className={BTN}>
                  PDF
                </a>
                <button type="button" onClick={() => setLinksFor(p.id)} className={BTN}>
                  🔗 {fr ? "Liens" : "Links"}
                </button>
                {p.status === "DRAFT" && (
                  <button type="button" onClick={() => setDialog({ id: p.id, key: Date.now() })} className={BTN}>
                    {fr ? "Modifier" : "Edit"}
                  </button>
                )}
                {p.status === "DRAFT" && (
                  <button type="button" disabled={pending} onClick={() =>
                    run(async () => {
                      setBlocked(null);
                      const res = await approveProposal(p.id, projectId);
                      if (res.error) setBlocked({ id: p.id, issues: res.issues ?? [res.error] });
                    })
                  } className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                    {fr ? "Approuver" : "Approve"}
                  </button>
                )}
                {p.status === "APPROVED" && (
                  <>
                    <span className="text-xs font-medium text-emerald-700">✓ {fr ? "Approuvée" : "Approved"}</span>
                    <SendDocumentButton
                      label={fr ? "Envoyer au client" : "Send to client"}
                      getInfo={() => proposalSendInfo(p.id, projectId)}
                      onSentAction={() => markProposalSent(p.id, projectId)}
                      lang={lang}
                      {...emailing}
                    />
                    <button type="button" disabled={pending} onClick={() => run(() => unapproveProposal(p.id, projectId))} className="text-xs text-soft hover:underline">
                      {fr ? "Remettre en brouillon" : "Return to draft"}
                    </button>
                  </>
                )}
                {p.status !== "DRAFT" && p.status !== "APPROVED" && <SignedCopy projectId={projectId} proposalId={p.id} fileName={p.signedFileName} fr={fr} />}
                {p.status === "SENT" && (
                  <>
                    <button type="button" disabled={pending} onClick={() => run(() => updateProposalStatus(p.id, projectId, "ACCEPTED"))} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      {fr ? "Marquer acceptée" : "Mark accepted"}
                    </button>
                    <button type="button" disabled={pending} onClick={() => run(() => updateProposalStatus(p.id, projectId, "DECLINED"))} className={BTN}>
                      {fr ? "Refusée" : "Declined"}
                    </button>
                  </>
                )}
              </div>
              {blocked && blocked.id === p.id && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  <p className="font-semibold">{fr ? "Impossible d'approuver : il manque des informations" : "Can't approve: information is missing"}</p>
                  <ul className="mt-1 list-disc pl-4">
                    {blocked.issues.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <Modal
          key={dialog.key}
          title={editing ? editing.title : fr ? "Nouvelle proposition" : "New proposal"}
          color={CARD_COLORS.proposals}
          onClose={() => setDialog(null)}
          headerExtra={
            <>
              <HeaderSave
                form="proposal-form"
                saving={saving}
                label={editing ? (fr ? "Enregistrer" : "Save changes") : fr ? "Créer la proposition" : "Create proposal"}
                savingLabel={fr ? "Enregistrement…" : "Saving…"}
              />
              {editing && (
              <button
                type="button"
                onClick={() => {
                  if (!confirm(fr ? "Supprimer cette proposition ?" : "Delete this proposal?")) return;
                  run(async () => {
                    await deleteProposal(editing.id, projectId);
                    setDialog(null);
                  });
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                {fr ? "Supprimer" : "Delete"}
              </button>
              )}
            </>
          }
        >
          <ProposalForm
            formId="proposal-form"
            hideSubmit
            onPendingChange={setSaving}
            action={editing ? updateFullProposal.bind(null, editing.id) : createFullProposal}
            projectId={projectId}
            defaultValues={
              editing
                ? {
                    title: editing.title,
                    status: editing.status,
                    currency: editing.currency,
                    coverLetter: editing.coverLetter,
                    notes: editing.notes,
                    lineItems: editing.lineItems,
                    subscriptions: editing.subscriptions,
                    paymentSchedule: editing.paymentSchedule,
                  }
                : { title: newDefaults.title, status: "DRAFT", currency: newDefaults.currency, coverLetter: newDefaults.coverLetter, subscriptions: newDefaults.subscriptions, paymentSchedule: newDefaults.paymentSchedule }
            }
            catalog={catalog}
            taxLocation={taxLocation}
            chargeCanadianTax={chargeCanadianTax}
            submitLabel={editing ? (fr ? "Enregistrer" : "Save changes") : fr ? "Créer la proposition" : "Create proposal"}
            lang={lang}
            inline
            projectType={projectType}
            onSuccess={() => {
              setDialog(null);
              router.refresh();
            }}
          />
          {editing && <DocumentLinks kind="proposal" docId={editing.id} projectId={projectId} linkables={linkables} lang={lang} />}
        </Modal>
      )}
      {linksFor && (() => {
        const doc = proposals.find((d) => d.id === linksFor);
        return doc ? (
          <Modal title={`${doc.title} — ${fr ? "Liens" : "Links"}`} color={CARD_COLORS.proposals} onClose={() => setLinksFor(null)}>
            <DocumentLinks kind="proposal" docId={doc.id} projectId={projectId} linkables={linkables} lang={lang} />
          </Modal>
        ) : null;
      })()}
    </Card>
  );
}

// ------------------------------------------------------------------- invoices

export function InvoicesCard({
  projectId,
  invoices,
  catalog,
  taxLocation,
  chargeCanadianTax,
  title,
  statusLabels,
  lang,
  emailing,
  linkables,
}: {
  projectId: string;
  invoices: InvoiceRowData[];
  catalog: CatalogItem[];
  taxLocation: { country: string | null; province: string | null };
  chargeCanadianTax: boolean;
  title: string;
  statusLabels: Record<string, string>;
  lang: Lang;
  emailing: EmailingProps;
  linkables: Linkables;
}) {
  const fr = lang === "fr";
  const router = useRouter();
  const [editId, setEditId] = useState<{ id: string; key: number } | null>(null);
  const [linksFor, setLinksFor] = useState<string | null>(null);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  const editing = editId ? invoices.find((i) => i.id === editId.id) : undefined;

  return (
    <Card
      color="invoices"
      title={
        <>
          {title}
          {invoices.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{invoices.length}</span>}
        </>
      }
      compact
      actions={
        <button
          type="button"
          disabled={pending}
          title={fr ? "Nouvelle facture" : "New invoice"}
          aria-label={fr ? "Nouvelle facture" : "New invoice"}
          onClick={() =>
            startTransition(async () => {
              const { id } = await createDraftInvoice(projectId);
              setEditId({ id, key: Date.now() });
              router.refresh();
            })
          }
          className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20 disabled:opacity-50"
        >
          +
        </button>
      }
    >
      {invoices.length === 0 ? (
        <p className="text-sm text-soft">—</p>
      ) : (
        <ul className="divide-y divide-card-border">
          {invoices.map((inv) => (
            <li key={inv.id} className="space-y-1.5 py-2 first:pt-0">
              <div className="flex items-center gap-2">
                {inv.status === "DRAFT" ? (
                  <button type="button" onClick={() => setEditId({ id: inv.id, key: Date.now() })} className="min-w-0 flex-1 text-left hover:underline">
                    <span className="block truncate text-sm font-medium text-ink">{inv.number || (fr ? "Facture" : "Invoice")}</span>
                    {inv.instalmentLabel && <span className="block truncate text-xs text-soft">{inv.instalmentLabel}</span>}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-ink">{inv.number || (fr ? "Facture" : "Invoice")}</span>
                    {inv.instalmentLabel && <span className="block truncate text-xs text-soft">{inv.instalmentLabel}</span>}
                  </span>
                )}
                <span className="shrink-0 text-right text-xs text-soft">
                  {money(inv.totalAmount, inv.currency)}
                  {inv.totalCad != null && <span className="block text-[10px]">≈ {money(inv.totalCad, "CAD")}</span>}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PILL[inv.status] ?? PILL.DRAFT}`}>{statusLabels[inv.status] ?? inv.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <a href={`/api/projects/${projectId}/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer" className={BTN}>
                  PDF
                </a>
                <button type="button" onClick={() => setLinksFor(inv.id)} className={BTN}>
                  🔗 {fr ? "Liens" : "Links"}
                </button>
                {inv.status === "DRAFT" && (
                  <button type="button" onClick={() => setEditId({ id: inv.id, key: Date.now() })} className={BTN}>
                    {fr ? "Modifier" : "Edit"}
                  </button>
                )}
                {inv.status === "DRAFT" && (
                  <button type="button" disabled={pending} onClick={() => run(() => approveInvoice(inv.id, projectId))} className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                    {fr ? "Approuver" : "Approve"}
                  </button>
                )}
                {inv.status === "APPROVED" && (
                  <>
                    <span className="text-xs font-medium text-emerald-700">✓ {fr ? "Approuvée" : "Approved"}</span>
                    <SendDocumentButton
                      label={fr ? "Envoyer au client" : "Send to client"}
                      getInfo={() => invoiceSendInfo(inv.id, projectId)}
                      onSentAction={() => markInvoiceSent(inv.id, projectId)}
                      lang={lang}
                      {...emailing}
                    />
                    <button type="button" disabled={pending} onClick={() => run(() => unapproveInvoice(inv.id, projectId))} className="text-xs text-soft hover:underline">
                      {fr ? "Remettre en brouillon" : "Return to draft"}
                    </button>
                  </>
                )}
                {(inv.status === "SENT" || inv.status === "OVERDUE") && (
                  <button type="button" disabled={pending} onClick={() => run(() => updateInvoiceStatus(inv.id, projectId, "PAID"))} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {fr ? "Marquer payée" : "Mark paid"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editId && editing && (
        <Modal
          key={editId.key}
          title={editing.number || (fr ? "Facture" : "Invoice")}
          color={CARD_COLORS.invoices}
          onClose={() => setEditId(null)}
          headerExtra={
            <>
            <HeaderSave form="invoice-form" saving={savingInvoice} label={fr ? "Enregistrer" : "Save changes"} savingLabel={fr ? "Enregistrement…" : "Saving…"} />
            <button
              type="button"
              onClick={() => {
                if (!confirm(fr ? "Supprimer cette facture ?" : "Delete this invoice?")) return;
                run(async () => {
                  await deleteInvoice(editing.id, projectId);
                  setEditId(null);
                });
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
            >
              {fr ? "Supprimer" : "Delete"}
            </button>
            </>
          }
        >
          <InvoiceLineItemsForm
            formId="invoice-form"
            hideSubmit
            onPendingChange={setSavingInvoice}
            action={updateInvoiceLineItems.bind(null, editing.id)}
            defaultValues={{ number: editing.number, status: editing.status, currency: editing.currency, dueDate: editing.dueDate, notes: editing.notes, lineItems: editing.lineItems }}
            catalog={catalog}
            taxLocation={taxLocation}
            chargeCanadianTax={chargeCanadianTax}
            lang={lang}
            onSuccess={() => {
              setEditId(null);
              router.refresh();
            }}
          />
          <DocumentLinks kind="invoice" docId={editing.id} projectId={projectId} linkables={linkables} lang={lang} />
        </Modal>
      )}
      {linksFor && (() => {
        const doc = invoices.find((d) => d.id === linksFor);
        return doc ? (
          <Modal title={`${doc.number || (fr ? "Facture" : "Invoice")} — ${fr ? "Liens" : "Links"}`} color={CARD_COLORS.invoices} onClose={() => setLinksFor(null)}>
            <DocumentLinks kind="invoice" docId={doc.id} projectId={projectId} linkables={linkables} lang={lang} />
          </Modal>
        ) : null;
      })()}
    </Card>
  );
}

