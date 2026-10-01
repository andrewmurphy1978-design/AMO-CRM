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
} from "@/actions/proposals";
import { approveInvoice, unapproveInvoice, invoiceSendInfo, markInvoiceSent, updateInvoiceStatus, deleteInvoice, updateInvoiceLineItems } from "@/actions/invoices";
import ProposalForm from "./proposals/proposal-form";
import InvoiceLineItemsForm from "./invoices/invoice-line-items-form";
import SendDocumentButton from "./send-document-button";
import NewInvoiceButton from "./new-invoice-button";

type CatalogItem = { id: string; name: string; description: string | null; clientDescription?: string | null; projectType?: string | null; unitPrice: number; currency: string; unit: string | null };
type Line = { description: string; details?: string | null; quantity: number; unitPrice: number };
type Sub = { name: string; amount: number; period: string; note: string };

export interface ProposalRowData {
  id: string;
  title: string;
  status: string;
  currency: string;
  totalAmount: number;
  approvedAt: string | null;
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

const money = (n: number, cur: string) => `${n.toFixed(2)} ${cur}`;

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
}) {
  const fr = lang === "fr";
  const router = useRouter();
  const [dialog, setDialog] = useState<{ id: string | null; key: number } | null>(null);
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
                <button type="button" onClick={() => setDialog({ id: p.id, key: Date.now() })} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:underline">
                  {p.title}
                </button>
                <span className="shrink-0 text-xs text-soft">{money(p.totalAmount, p.currency)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PILL[p.status] ?? PILL.DRAFT}`}>{statusLabels[p.status] ?? p.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <a href={`/api/projects/${projectId}/proposals/${p.id}/pdf`} target="_blank" rel="noreferrer" className={BTN}>
                  PDF
                </a>
                <button type="button" onClick={() => setDialog({ id: p.id, key: Date.now() })} className={BTN}>
                  {fr ? "Modifier" : "Edit"}
                </button>
                {p.status === "DRAFT" && !p.approvedAt && (
                  <button type="button" disabled={pending} onClick={() => run(() => approveProposal(p.id, projectId))} className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                    {fr ? "Approuver" : "Approve"}
                  </button>
                )}
                {p.status === "DRAFT" && p.approvedAt && (
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
                      {fr ? "annuler" : "undo"}
                    </button>
                  </>
                )}
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
            editing ? (
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
            ) : undefined
          }
        >
          <ProposalForm
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
        </Modal>
      )}
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
}) {
  const fr = lang === "fr";
  const router = useRouter();
  const [editId, setEditId] = useState<{ id: string; key: number } | null>(null);
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
      actions={<NewInvoiceButton projectId={projectId} lang={lang} />}
    >
      {invoices.length === 0 ? (
        <p className="text-sm text-soft">—</p>
      ) : (
        <ul className="divide-y divide-card-border">
          {invoices.map((inv) => (
            <li key={inv.id} className="space-y-1.5 py-2 first:pt-0">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setEditId({ id: inv.id, key: Date.now() })} className="min-w-0 flex-1 text-left hover:underline">
                  <span className="block truncate text-sm font-medium text-ink">{inv.number || (fr ? "Facture" : "Invoice")}</span>
                  {inv.instalmentLabel && <span className="block truncate text-xs text-soft">{inv.instalmentLabel}</span>}
                </button>
                <span className="shrink-0 text-xs text-soft">{money(inv.totalAmount, inv.currency)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PILL[inv.status] ?? PILL.DRAFT}`}>{statusLabels[inv.status] ?? inv.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <a href={`/api/projects/${projectId}/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer" className={BTN}>
                  PDF
                </a>
                <button type="button" onClick={() => setEditId({ id: inv.id, key: Date.now() })} className={BTN}>
                  {fr ? "Modifier" : "Edit"}
                </button>
                {inv.status === "DRAFT" && !inv.approvedAt && (
                  <button type="button" disabled={pending} onClick={() => run(() => approveInvoice(inv.id, projectId))} className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                    {fr ? "Approuver" : "Approve"}
                  </button>
                )}
                {inv.status === "DRAFT" && inv.approvedAt && (
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
                      {fr ? "annuler" : "undo"}
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
          }
        >
          <InvoiceLineItemsForm
            action={updateInvoiceLineItems.bind(null, editing.id)}
            defaultValues={{ number: editing.number, currency: editing.currency, dueDate: editing.dueDate, notes: editing.notes, lineItems: editing.lineItems }}
            catalog={catalog}
            taxLocation={taxLocation}
            chargeCanadianTax={chargeCanadianTax}
            lang={lang}
            onSuccess={() => {
              setEditId(null);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </Card>
  );
}

