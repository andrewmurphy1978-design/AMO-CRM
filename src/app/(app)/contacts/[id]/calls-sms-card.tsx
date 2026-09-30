"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import Card from "@/components/section-card";
import {
  CallsSmsDialog,
  failureReason,
  formatPhone,
  formatWhen,
  type CallsSmsEntry,
  type CallsSmsLinkData,
  type CallsSmsSending,
  type NamedOption,
} from "./calls-sms-dialog";

export type { CallsSmsEntry, CallsSmsSending, CallsSmsLinkData } from "./calls-sms-dialog";

const TYPE_BADGES: Record<string, string> = {
  CALL: "bg-teal-50 text-teal-700",
  MEETING: "bg-amber-100 text-amber-700",
  SMS: "bg-violet-50 text-violet-700",
  NOTE: "bg-emerald-50 text-emerald-700",
  EMAIL: "bg-sky-50 text-sky-700",
};

// The Calls & SMS card: a + in the header adds an entry, clicking a row
// edits it — both through the same dialog.
export default function CallsSmsCard({
  contactId,
  contact,
  relatedContacts,
  teamMembers,
  linkData,
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
  linkData: CallsSmsLinkData;
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
          linkData={linkData}
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

