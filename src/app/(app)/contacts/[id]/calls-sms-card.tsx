"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteInteraction, saveContactInteraction } from "@/actions/interactions";
import { markSmsSeen } from "@/actions/sms";
import { explainTwilioError } from "@/lib/twilio-errors";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import Card, { CARD_COLORS } from "@/components/section-card";
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
  projectId: string | null;
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

interface NamedOption {
  id: string;
  name: string;
}

const TYPE_BADGES: Record<string, string> = {
  CALL: "bg-teal-50 text-teal-700",
  MEETING: "bg-amber-100 text-amber-700",
  SMS: "bg-violet-50 text-violet-700",
  NOTE: "bg-emerald-50 text-emerald-700",
  EMAIL: "bg-sky-50 text-sky-700",
};

const FIELD_CLASS =
  "mt-1 w-full min-w-0 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

// "2026-09-30T14:05" in the viewer's own timezone, for <input type="datetime-local">.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// +15149536985 -> (514) 953-6985 (NANP); anything else is shown as stored.
function formatPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

// Twilio's delivery statuses in plain words; anything unrecognized is shown
// as Twilio sent it.
function smsStatusText(t: ReturnType<typeof getDict>, status: string | null, sendingNow: boolean): { text: string; bad: boolean } {
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
function failureReason(t: ReturnType<typeof getDict>, lang: Lang, entry: { deliveryStatus: string | null; errorCode: string | null }): string | null {
  if (!entry.deliveryStatus || !["failed", "undelivered", "canceled"].includes(entry.deliveryStatus)) return null;
  return explainTwilioError(entry.errorCode, lang) ?? t.callsSms.failedNoReason;
}

function formatWhen(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

// The Calls & SMS card: a + in the header adds an entry, clicking a row
// edits it — both through the same dialog.
export default function CallsSmsCard({
  contactId,
  contact,
  relatedContacts,
  teamMembers,
  projects,
  currentUserId,
  entries,
  sending,
  lang,
  title,
}: {
  contactId: string;
  contact: NamedOption;
  relatedContacts: NamedOption[];
  teamMembers: NamedOption[];
  projects: NamedOption[];
  currentUserId: string | null;
  entries: CallsSmsEntry[];
  sending: CallsSmsSending;
  lang: Lang;
  title: string;
}) {
  const t = getDict(lang);
  const [dialog, setDialog] = useState<{ entry: CallsSmsEntry | null; key: number; replyTo?: string } | null>(null);
  const [counter, setCounter] = useState(0);
  const router = useRouter();

  // A text still on its way out (queued/sending/sent) gets its final status
  // from Twilio a moment later — re-read the page every few seconds until
  // that lands, for at most a minute, so it updates without a manual reload.
  const inFlight = entries.some((e) => e.direction === "OUTBOUND" && ["queued", "accepted", "sending", "sent"].includes(e.deliveryStatus ?? ""));
  useEffect(() => {
    if (!inFlight) return;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      router.refresh();
      if (ticks >= 15) clearInterval(timer);
    }, 4000);
    return () => clearInterval(timer);
  }, [inFlight, router]);

  const typeLabels: Record<string, string> = {
    CALL: t.callsSms.typeCall,
    MEETING: t.callsSms.typeMeeting,
    SMS: t.callsSms.typeSms,
    NOTE: t.callsSms.typeNote,
    EMAIL: t.callsSms.typeEmail,
  };

  function open(entry: CallsSmsEntry | null, replyTo?: string) {
    setCounter((c) => c + 1);
    setDialog({ entry, key: counter + 1, replyTo });
  }

  return (
    <Card
      color="interactions"
      title={
        <>
          {title}
          {entries.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">
              {entries.length}
            </span>
          )}
        </>
      }
      compact
      flushTop
      actions={
        <button
          type="button"
          title={t.callsSms.addTitle}
          aria-label={t.callsSms.addTitle}
          onClick={() => open(null)}
          className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20"
        >
          +
        </button>
      }
    >
      {entries.length === 0 ? (
        <p className="pt-2 text-sm text-soft">{t.callsSms.empty}</p>
      ) : (
        <ul className="divide-y divide-card-border">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => open(entry)} className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-2 text-left hover:bg-black/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TYPE_BADGES[entry.type] ?? TYPE_BADGES.NOTE}`}>
                        {typeLabels[entry.type] ?? entry.type}
                      </span>
                      {entry.direction && (
                        <span className="text-xs font-medium text-soft">
                          {entry.direction === "INBOUND" ? `↙ ${t.callsSms.received}` : `↗ ${t.callsSms.sent}`}
                          {entry.direction === "OUTBOUND" && entry.deliveryStatus && ` · ${entry.deliveryStatus}`}
                        </span>
                      )}
                      {entry.direction === "INBOUND" && !entry.seenAt && (
                        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">{t.callsSms.newBadge}</span>
                      )}
                      {entry.type !== "SMS" && entry.subject && <span className="text-sm font-medium text-ink">{entry.subject}</span>}
                    </div>
                    {(entry.participants.length > 0 || entry.externalNumber) && (
                      <p className="mt-1 truncate text-xs text-soft">
                        {[...entry.participants.map((p) => p.name), ...(entry.externalNumber ? [formatPhone(entry.externalNumber)] : [])].join(" · ")}
                      </p>
                    )}
                    {entry.notes && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-ink">{entry.notes}</p>}
                    {failureReason(t, lang, entry) && <p className="mt-1 text-xs text-red-600">{failureReason(t, lang, entry)}</p>}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-right text-xs text-soft" suppressHydrationWarning>
                    {formatWhen(entry.occurredAt, lang)}
                    {entry.durationMinutes != null && (
                      <>
                        <br />
                        {entry.durationMinutes} {t.callsSms.minutesShort}
                      </>
                    )}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <CallsSmsDialog
          key={dialog.key}
          entry={dialog.entry}
          replyTo={dialog.replyTo}
          onReply={(to) => open(null, to)}
          contactId={contactId}
          contact={contact}
          relatedContacts={relatedContacts}
          teamMembers={teamMembers}
          projects={projects}
          currentUserId={currentUserId}
          sending={sending}
          lang={lang}
          typeLabels={typeLabels}
          onClose={() => setDialog(null)}
        />
      )}
    </Card>
  );
}

function CallsSmsDialog({
  entry,
  replyTo,
  onReply,
  contactId,
  contact,
  relatedContacts,
  teamMembers,
  projects,
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
  contactId: string;
  contact: NamedOption;
  relatedContacts: NamedOption[];
  teamMembers: NamedOption[];
  projects: NamedOption[];
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

  // A new entry starts with the contact and the person logging it; an
  // existing one starts from whoever was saved on it.
  const selected = new Set(
    entry
      ? entry.participants.map((p) => `${p.kind}:${p.id}`)
      : [`contact:${contactId}`, ...(currentUserId ? [`user:${currentUserId}`] : [])]
  );

  const typeOptions = ["CALL", "MEETING", "SMS", "NOTE", ...(entry?.type === "EMAIL" ? ["EMAIL"] : [])];
  const groups: { label: string; kind: "contact" | "user"; people: NamedOption[]; className: string }[] = [
    { label: t.callsSms.participantContact, kind: "contact", people: [contact], className: "" },
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
            {entry.direction === "INBOUND" && entry.externalNumber && sending.ready && (
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
                await deleteInteraction(entry.id, contactId, entry.projectId);
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
      action={saveContactInteraction.bind(null, contactId, entry?.id ?? null)}
      labels={t.phaseDialog}
      wide
      headerColorClassName={CARD_COLORS.interactions}
      submitLabels={sendingNow ? { idle: t.callsSms.send, pending: t.callsSms.sendingNow } : undefined}
      submitIcon={sendingNow ? <SendIcon /> : undefined}
    >
      <div className={`grid gap-3 sm:grid-cols-2 ${projects.length > 0 ? "lg:grid-cols-[9rem_minmax(0,1.3fr)_7rem_minmax(0,1fr)]" : "lg:grid-cols-[9rem_minmax(0,1.3fr)_7rem]"}`}>
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
        {projects.length > 0 && (
          <div>
            <label className={LABEL_CLASS}>{t.callsSms.project}</label>
            <select name="projectId" defaultValue={entry?.projectId ?? ""} className={FIELD_CLASS}>
              <option value="">{t.callsSms.noProject}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
