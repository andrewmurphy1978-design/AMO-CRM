"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteInteraction, saveContactInteraction } from "@/actions/interactions";
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
  const [dialog, setDialog] = useState<{ entry: CallsSmsEntry | null; key: number } | null>(null);
  const [counter, setCounter] = useState(0);

  const typeLabels: Record<string, string> = {
    CALL: t.callsSms.typeCall,
    MEETING: t.callsSms.typeMeeting,
    SMS: t.callsSms.typeSms,
    NOTE: t.callsSms.typeNote,
    EMAIL: t.callsSms.typeEmail,
  };

  function open(entry: CallsSmsEntry | null) {
    setCounter((c) => c + 1);
    setDialog({ entry, key: counter + 1 });
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
                      {entry.subject && <span className="text-sm font-medium text-ink">{entry.subject}</span>}
                    </div>
                    {entry.participants.length > 0 && (
                      <p className="mt-1 truncate text-xs text-soft">{entry.participants.map((p) => p.name).join(", ")}</p>
                    )}
                    {entry.notes && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-ink">{entry.notes}</p>}
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
  const [type, setType] = useState(entry?.type ?? "CALL");
  const [sendAsText, setSendAsText] = useState(false);
  const canSend = !entry && type === "SMS" && sending.ready && sending.numbers.length > 0;
  const sendingNow = canSend && sendAsText;
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
        ) : undefined
      }
      action={saveContactInteraction.bind(null, contactId, entry?.id ?? null)}
      labels={t.phaseDialog}
      wide
      headerColorClassName={CARD_COLORS.interactions}
    >
      <div className={`grid gap-3 sm:grid-cols-2 ${projects.length > 0 ? "lg:grid-cols-[9rem_minmax(0,1.3fr)_7rem_minmax(0,1fr)]" : "lg:grid-cols-[9rem_minmax(0,1.3fr)_7rem]"}`}>
        <div>
          <label className={LABEL_CLASS}>{t.callsSms.type}</label>
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={FIELD_CLASS}>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {typeLabels[type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.callsSms.dateTime}</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={FIELD_CLASS} />
          {/* The browser's own timezone is the only one that knows what the
              typed wall-clock time means, so it's converted here. */}
          <input type="hidden" name="occurredAt" value={when ? new Date(when).toISOString() : ""} readOnly />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.callsSms.duration}</label>
          <input type="number" name="durationMinutes" min={0} step={1} defaultValue={entry?.durationMinutes ?? ""} className={FIELD_CLASS} />
        </div>
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

      <div>
        <label className={LABEL_CLASS}>{t.callsSms.subject}</label>
        <input name="subject" defaultValue={entry?.subject ?? ""} className={FIELD_CLASS} />
      </div>

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
                <select name="smsTo" defaultValue={sending.numbers[0].value} className={FIELD_CLASS}>
                  {sending.numbers.map((n) => (
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
        <label className={LABEL_CLASS}>{sendingNow ? t.callsSms.message : t.callsSms.discussed}</label>
        <textarea name="notes" rows={sendingNow ? 5 : 9} defaultValue={entry?.notes ?? ""} className={FIELD_CLASS} />
      </div>

      {entry && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-card-border pt-3 text-xs text-soft">
          <div className="space-y-0.5" suppressHydrationWarning>
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
