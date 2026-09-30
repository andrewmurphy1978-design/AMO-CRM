"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteInteraction, saveContactInteraction } from "@/actions/interactions";
import { markSmsSeen } from "@/actions/sms";
import { explainTwilioError } from "@/lib/twilio-errors";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { CARD_COLORS } from "@/components/section-card";
import SectionDialog from "./section-dialog";

export interface CallsSmsParticipant {
  kind: "contact" | "user";
  id: string;
  name: string;
}

export interface CallsSmsEntry {
  id: string;
  type: string;
  subject: string | null;
  notes: string;
  occurredAt: string; // ISO
  durationMinutes: number | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  createdBy: string | null;
  updatedBy: string | null;
  contactId: string | null; // null on an incoming text from a number matching no contact
  projectId: string | null;
  phaseId: string | null;
  taskId: string | null;
  participants: CallsSmsParticipant[];
  direction: string | null; // "INBOUND" | "OUTBOUND" for Twilio texts
  deliveryStatus: string | null;
  externalNumber: string | null; // the other party's E.164 number for Twilio texts
  errorCode: string | null; // Twilio's error code when a sent text failed
  seenAt: string | null; // null on an incoming text nobody has opened yet
}

// What the dialog needs to offer "send as a text": Twilio connected, and the
// contact's phone numbers (E.164) to send to.
export interface CallsSmsSending {
  ready: boolean;
  numbers: { value: string; label: string }[];
}

export interface NamedOption {
  id: string;
  name: string;
}


// Where an entry can be linked inside the CRM: projects (of the chosen
// contact), then a phase and a task of the chosen project.
export interface CallsSmsLinkData {
  projects: { id: string; name: string; contactId: string | null }[];
  phases: { id: string; name: string; projectId: string }[];
  tasks: { id: string; name: string; projectId: string; phaseId: string | null }[];
}

const FIELD_CLASS =
  "mt-1 w-full min-w-0 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

// "2026-09-30T14:05" in the viewer's own timezone, for <input type="datetime-local">.
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// +15149536985 -> (514) 953-6985 (NANP); anything else is shown as stored.
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

// Twilio's delivery statuses in plain words; anything unrecognized is shown
// as Twilio sent it.
export function smsStatusText(t: ReturnType<typeof getDict>, status: string | null, sendingNow: boolean): { text: string; bad: boolean } {
  const c = t.callsSms;
  if (!status) return { text: sendingNow ? c.statusReady : c.statusNone, bad: false };
  const known: Record<string, string> = {
    received: c.statusReceived,
    queued: c.statusQueued,
    accepted: c.statusQueued,
    scheduled: c.statusQueued,
    sending: c.statusSending,
    sent: c.statusSent,
    delivered: c.statusDelivered,
    undelivered: c.statusUndelivered,
    failed: c.statusFailed,
    canceled: c.statusFailed,
  };
  return { text: known[status] ?? status, bad: ["undelivered", "failed", "canceled"].includes(status) };
}

// Why a text failed, in words — Twilio's code explained, or a plain note when
// Twilio gave no code.
export function failureReason(t: ReturnType<typeof getDict>, lang: Lang, entry: { deliveryStatus: string | null; errorCode: string | null }): string | null {
  if (!entry.deliveryStatus || !["failed", "undelivered", "canceled"].includes(entry.deliveryStatus)) return null;
  return explainTwilioError(entry.errorCode, lang) ?? t.callsSms.failedNoReason;
}

export function formatWhen(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function CallsSmsDialog({
  entry,
  replyTo,
  onReply,
  contactId,
  contact,
  contacts = [],
  relatedContacts,
  teamMembers,
  linkData,
  currentUserId,
  sending,
  lang,
  typeLabels,
  onClose,
}: {
  entry: CallsSmsEntry | null;
  // Set when opened from a received text's Reply: a new SMS, ready to send.
  replyTo?: string;
  onReply: (to: string) => void;
  // null for an incoming text from a number that matches no contact yet.
  contactId: string | null;
  contact: NamedOption | null;
  // Contacts to choose from when the entry isn't linked to one yet.
  contacts?: NamedOption[];
  relatedContacts: NamedOption[];
  teamMembers: NamedOption[];
  linkData: CallsSmsLinkData;
  currentUserId: string | null;
  sending: CallsSmsSending;
  lang: Lang;
  typeLabels: Record<string, string>;
  onClose: () => void;
}) {
  const t = getDict(lang);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Opening a received text counts as seeing it.
  const unseen = entry?.direction === "INBOUND" && !entry.seenAt;
  const entryId = entry?.id;
  useEffect(() => {
    if (unseen && entryId) void markSmsSeen([entryId]);
  }, [unseen, entryId]);
  const [type, setType] = useState(replyTo ? "SMS" : (entry?.type ?? "CALL"));
  const [sendAsText, setSendAsText] = useState(Boolean(replyTo));
  // A text that went through Twilio is a record of what was actually sent or
  // received, so its type and message can't be edited afterwards.
  const locked = Boolean(entry?.direction);
  const isSms = type === "SMS";
  // The time of a text is when it was sent/received, not something to edit.
  const dateLocked = locked || (isSms && sendAsText && !entry);
  const sendNumbers = replyTo && !sending.numbers.some((n) => n.value === replyTo) ? [{ value: replyTo, label: formatPhone(replyTo) }, ...sending.numbers] : sending.numbers;
  const canSend = !entry && type === "SMS" && sending.ready && sendNumbers.length > 0;
  const sendingNow = canSend && sendAsText;
  const smsStatus = smsStatusText(t, entry?.deliveryStatus ?? null, sendingNow);
  const [when, setWhen] = useState(() => toLocalInput(entry?.occurredAt ?? new Date().toISOString()));

  // Linking: the contact (only asked for when the entry has none), then a
  // project of that contact, a phase and a task of that project.
  const baseContactId = entry?.contactId ?? contactId;
  const needsContact = !baseContactId;
  const [pickedContactId, setPickedContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const effectiveContactId = baseContactId ?? (pickedContactId || null);
  const [projectId, setProjectId] = useState(entry?.projectId ?? "");
  const [phaseId, setPhaseId] = useState(entry?.phaseId ?? "");
  const [taskId, setTaskId] = useState(entry?.taskId ?? "");
  const projectChoices = linkData.projects.filter((p) => effectiveContactId && p.contactId === effectiveContactId);
  const phaseChoices = projectId ? linkData.phases.filter((p) => p.projectId === projectId) : [];
  const taskChoices = projectId ? linkData.tasks.filter((tk) => tk.projectId === projectId && (!phaseId || tk.phaseId === phaseId)) : [];
  const pickedContact = contacts.find((c) => c.id === pickedContactId) ?? null;
  const contactMatches = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return (q ? contacts.filter((c) => c.name.toLowerCase().includes(q)) : contacts).slice(0, 8);
  }, [contacts, contactSearch]);

  // A new entry starts with the contact and the person logging it; an
  // existing one starts from whoever was saved on it.
  const selected = new Set(
    entry
      ? entry.participants.map((p) => `${p.kind}:${p.id}`)
      : [`contact:${contactId ?? ""}`, ...(currentUserId ? [`user:${currentUserId}`] : [])]
  );

  const typeOptions = ["CALL", "MEETING", "SMS", "NOTE", ...(entry?.type === "EMAIL" ? ["EMAIL"] : [])];
  const groups: { label: string; kind: "contact" | "user"; people: NamedOption[]; className: string }[] = [
    ...(contact ? [{ label: t.callsSms.participantContact, kind: "contact" as const, people: [contact], className: "" }] : []),
    // Team members sit beside the contact (right-aligned) on desktop, and
    // ahead of the related contacts on mobile.
    ...(teamMembers.length > 0 ? [{ label: t.callsSms.participantTeam, kind: "user" as const, people: teamMembers, className: "sm:text-right" }] : []),
    ...(relatedContacts.length > 0 ? [{ label: t.callsSms.participantRelated, kind: "contact" as const, people: relatedContacts, className: "sm:col-span-2" }] : []),
  ];

  return (
    <SectionDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t.callsSms.dialogTitle}
      headerExtra={
        entry ? (
          <>
            {entry.direction === "INBOUND" && entry.externalNumber && entry.contactId && sending.ready && (
              <button
                type="button"
                onClick={() => onReply(entry.externalNumber as string)}
                className="flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-1.5 text-sm font-semibold hover:bg-white/30"
              >
                ↩ {t.callsSms.reply}
              </button>
            )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t.callsSms.deleteConfirm)) return;
              startTransition(async () => {
                await deleteInteraction(entry.id, contactId ?? entry.contactId ?? "", entry.projectId);
                router.refresh();
                onClose();
              });
            }}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {t.callsSms.delete}
          </button>
          </>
        ) : undefined
      }
      action={saveContactInteraction.bind(null, contactId ?? "", entry?.id ?? null)}
      labels={t.phaseDialog}
      wide
      headerColorClassName={CARD_COLORS.interactions}
      submitLabels={sendingNow ? { idle: t.callsSms.send, pending: t.callsSms.sendingNow } : undefined}
      submitIcon={sendingNow ? <SendIcon /> : undefined}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[9rem_minmax(0,1.3fr)_7rem]">
        <div>
          <label className={LABEL_CLASS}>{t.callsSms.type}</label>
          <select name={locked ? undefined : "type"} value={type} disabled={locked} onChange={(e) => setType(e.target.value)} className={FIELD_CLASS}>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {typeLabels[type]}
              </option>
            ))}
          </select>
          {locked && <input type="hidden" name="type" value={type} />}
        </div>
        <div>
          <label className={LABEL_CLASS}>
            {isSms ? (entry?.direction === "INBOUND" ? t.callsSms.receivedAt : t.callsSms.sentAt) : t.callsSms.dateTime}
          </label>
          <input
            type="datetime-local"
            value={when}
            readOnly={dateLocked}
            onChange={(e) => setWhen(e.target.value)}
            className={`${FIELD_CLASS} ${dateLocked ? "cursor-not-allowed bg-black/[0.04] text-soft" : ""}`}
          />
          {/* The browser's own timezone is the only one that knows what the
              typed wall-clock time means, so it's converted here. */}
          <input type="hidden" name="occurredAt" value={when ? new Date(when).toISOString() : ""} readOnly />
        </div>
        {isSms ? (
          <div>
            <label className={LABEL_CLASS}>{t.callsSms.status}</label>
            <input
              readOnly
              value={smsStatus.text}
              className={`${FIELD_CLASS} cursor-not-allowed bg-black/[0.04] ${smsStatus.bad ? "font-semibold text-red-600" : "text-soft"}`}
            />
          </div>
        ) : (
          <div>
            <label className={LABEL_CLASS}>{t.callsSms.duration}</label>
            <input type="number" name="durationMinutes" min={0} step={1} defaultValue={entry?.durationMinutes ?? ""} className={FIELD_CLASS} />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className={LABEL_CLASS}>{t.callsSms.linkedTo}</p>
        {needsContact && (
          <div>
            {pickedContact ? (
              <div className="flex items-center justify-between rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink">
                <span className="truncate">{pickedContact.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPickedContactId("");
                    setProjectId("");
                    setPhaseId("");
                    setTaskId("");
                  }}
                  className="ml-2 shrink-0 text-xs text-soft hover:underline"
                >
                  {t.callsSms.clearLink}
                </button>
              </div>
            ) : (
              <>
                <input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder={t.callsSms.searchContact} className={FIELD_CLASS + " mt-0"} />
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-card-border">
                  {contactMatches.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-soft">{t.callsSms.noContacts}</p>
                  ) : (
                    contactMatches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setPickedContactId(c.id);
                          setContactSearch("");
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-amo-lime/10"
                      >
                        {c.name}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
            <input type="hidden" name="linkContactId" value={pickedContactId} />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL_CLASS}>{t.callsSms.project}</label>
            <select
              name="projectId"
              value={projectId}
              disabled={!effectiveContactId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setPhaseId("");
                setTaskId("");
              }}
              className={`${FIELD_CLASS} disabled:opacity-50`}
            >
              <option value="">{t.callsSms.noProject}</option>
              {projectChoices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.callsSms.phase}</label>
            <select
              name="phaseId"
              value={phaseId}
              disabled={!projectId}
              onChange={(e) => {
                setPhaseId(e.target.value);
                setTaskId("");
              }}
              className={`${FIELD_CLASS} disabled:opacity-50`}
            >
              <option value="">{t.callsSms.noProject}</option>
              {phaseChoices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t.callsSms.task}</label>
            <select name="taskId" value={taskId} disabled={!projectId} onChange={(e) => setTaskId(e.target.value)} className={`${FIELD_CLASS} disabled:opacity-50`}>
              <option value="">{t.callsSms.noProject}</option>
              {taskChoices.map((tk) => (
                <option key={tk.id} value={tk.id}>
                  {tk.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!effectiveContactId && <p className="text-xs text-soft">{t.callsSms.chooseContactFirst}</p>}
      </div>

      {!isSms && (
        <div>
          <label className={LABEL_CLASS}>{t.callsSms.subject}</label>
          <input name="subject" defaultValue={entry?.subject ?? ""} className={FIELD_CLASS} />
        </div>
      )}

      {!isSms && (
      <div>
        <p className={LABEL_CLASS}>{t.callsSms.participants}</p>
        <div className="mt-1 grid gap-3 rounded-md border border-card-border bg-field-bg p-3 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.label} className={group.className}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">{group.label}</p>
              <div className={`mt-1 flex flex-wrap gap-x-4 gap-y-1 ${group.className.includes("text-right") ? "sm:justify-end" : ""}`}>
                {group.people.map((person) => {
                  const value = `${group.kind}:${person.id}`;
                  return (
                    <label key={value} className="flex items-center gap-1.5 text-sm text-ink">
                      <input
                        type="checkbox"
                        name="participant"
                        value={value}
                        defaultChecked={selected.has(value)}
                        className="h-4 w-4 rounded border-card-border accent-amo-lime"
                      />
                      {person.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {entry && failureReason(t, lang, entry) && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="font-semibold">{t.callsSms.whyFailed}</span> {failureReason(t, lang, entry)}
        </p>
      )}

      {canSend && (
        <div className="space-y-2 rounded-md border border-card-border bg-field-bg p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              name="sendViaTwilio"
              checked={sendAsText}
              onChange={(e) => setSendAsText(e.target.checked)}
              className="h-4 w-4 rounded border-card-border accent-amo-lime"
            />
            {t.callsSms.sendAsText}
          </label>
          {sendAsText && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end">
              <div>
                <label className={LABEL_CLASS}>{t.callsSms.sendTo}</label>
                <select name="smsTo" defaultValue={replyTo ?? sendNumbers[0].value} className={FIELD_CLASS}>
                  {sendNumbers.map((n) => (
                    <option key={n.value} value={n.value}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-soft">{t.callsSms.sendButtonHint}</p>
            </div>
          )}
        </div>
      )}

      <div>
        <label className={LABEL_CLASS}>{isSms ? t.callsSms.message : t.callsSms.discussed}</label>
        <textarea
          name="notes"
          rows={isSms ? 5 : 9}
          defaultValue={entry?.notes ?? ""}
          readOnly={locked}
          className={`${FIELD_CLASS} ${locked ? "cursor-not-allowed bg-black/[0.04] text-soft" : ""}`}
        />
      </div>

      {entry && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-card-border pt-3 text-xs text-soft">
          <div className="space-y-0.5" suppressHydrationWarning>
            {entry.externalNumber && (
              <p>
                <span className="font-semibold uppercase tracking-wide text-ink">{entry.direction === "INBOUND" ? t.callsSms.phoneFrom : t.callsSms.phoneTo}:</span>{" "}
                {formatPhone(entry.externalNumber)}
              </p>
            )}
            <p>
              <span className="font-semibold uppercase tracking-wide text-ink">{t.callsSms.created}:</span> {formatWhen(entry.createdAt, lang)}
              {entry.createdBy && ` ${t.callsSms.by} ${entry.createdBy}`}
            </p>
            <p>
              <span className="font-semibold uppercase tracking-wide text-ink">{t.callsSms.modified}:</span> {formatWhen(entry.updatedAt, lang)}
              {entry.updatedBy && ` ${t.callsSms.by} ${entry.updatedBy}`}
            </p>
          </div>
        </div>
      )}
    </SectionDialog>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" />
    </svg>
  );
}
