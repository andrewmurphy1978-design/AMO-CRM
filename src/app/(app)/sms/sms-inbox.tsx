"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContactFromSms, linkSmsToContact, markSmsSeen } from "@/actions/sms";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { CallsSmsDialog, type CallsSmsEntry, type CallsSmsLinkData } from "../contacts/[id]/calls-sms-dialog";

export interface UnlinkedGroup {
  number: string;
  texts: { id: string; text: string; receivedAt: string; entry: CallsSmsEntry }[];
}

export interface NewText {
  id: string;
  contactId: string;
  contactName: string;
  text: string;
  receivedAt: string;
  entry: CallsSmsEntry;
}

const FIELD_CLASS =
  "w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const BUTTON_CLASS = "rounded-md border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60";

function formatPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-4 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
        {title}
        {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-xs font-semibold text-white">{count}</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function SmsInbox({
  unlinked,
  newTexts,
  contacts,
  linkData,
  twilioReady,
  currentUserId,
  lang,
}: {
  unlinked: UnlinkedGroup[];
  newTexts: NewText[];
  contacts: { id: string; label: string }[];
  linkData: CallsSmsLinkData;
  twilioReady: boolean;
  currentUserId: string | null;
  lang: Lang;
}) {
  const t = getDict(lang);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState<string | null>(null); // number whose contact picker is open
  const [creating, setCreating] = useState<string | null>(null); // number whose new-contact form is open
  const [search, setSearch] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");

  // The SMS dialog (the same one the contact's Calls & SMS card opens). An
  // unlinked text opens it with the contact picker; Reply opens a fresh one.
  const [dialog, setDialog] = useState<{ entry: CallsSmsEntry | null; key: number; replyTo?: string; contact: { id: string; name: string } | null } | null>(null);
  const [dialogCount, setDialogCount] = useState(0);
  function openDialog(entry: CallsSmsEntry | null, contact: { id: string; name: string } | null, replyTo?: string) {
    setDialogCount((c) => c + 1);
    setDialog({ entry, key: dialogCount + 1, replyTo, contact });
  }
  const typeLabels: Record<string, string> = {
    CALL: t.callsSms.typeCall,
    MEETING: t.callsSms.typeMeeting,
    SMS: t.callsSms.typeSms,
    NOTE: t.callsSms.typeNote,
    EMAIL: t.callsSms.typeEmail,
  };
  const contactOptions = useMemo(() => contacts.map((c) => ({ id: c.id, name: c.label })), [contacts]);

  const fmt = useMemo(() => new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" }), [lang]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? contacts.filter((c) => c.label.toLowerCase().includes(q)) : contacts).slice(0, 8);
  }, [contacts, search]);

  return (
    <div className="space-y-6">
      <Section title={t.smsPage.unlinkedTitle} count={unlinked.length}>
        {unlinked.length === 0 ? (
          <p className="text-sm text-soft">{t.smsPage.noUnlinked}</p>
        ) : (
          <ul className="divide-y divide-card-border">
            {unlinked.map((group) => (
              <li key={group.number} className="space-y-2 py-3 first:pt-0">
                <p className="text-sm font-semibold text-ink">{formatPhone(group.number)}</p>
                {group.texts.map((text) => (
                  <button
                    key={text.id}
                    type="button"
                    onClick={() => openDialog(text.entry, null)}
                    className="block w-full rounded-md bg-black/[0.03] px-3 py-2 text-left hover:bg-black/[0.06]"
                  >
                    <span className="block whitespace-pre-wrap break-words text-sm text-ink">{text.text}</span>
                    <span className="mt-1 block text-xs text-soft" suppressHydrationWarning>
                      {t.smsPage.receivedAt} {fmt.format(new Date(text.receivedAt))}
                    </span>
                  </button>
                ))}

                {picking === group.number ? (
                  <div className="space-y-2">
                    <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.smsPage.searchContact} className={FIELD_CLASS} />
                    <div className="max-h-48 overflow-y-auto rounded-md border border-card-border">
                      {matches.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-soft">{t.smsPage.noResults}</p>
                      ) : (
                        matches.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await linkSmsToContact(group.number, c.id);
                                setPicking(null);
                                setSearch("");
                                router.refresh();
                              })
                            }
                            className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-amo-lime/10"
                          >
                            {c.label}
                          </button>
                        ))
                      )}
                    </div>
                    <button type="button" onClick={() => setPicking(null)} className="text-xs text-soft hover:underline">
                      {t.smsPage.cancel}
                    </button>
                  </div>
                ) : creating === group.number ? (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder={t.smsPage.firstName} className={FIELD_CLASS} />
                      <input value={last} onChange={(e) => setLast(e.target.value)} placeholder={t.smsPage.lastName} className={FIELD_CLASS} />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const id = await createContactFromSms(group.number, first, last);
                            setCreating(null);
                            setFirst("");
                            setLast("");
                            router.push(`/contacts/${id}`);
                          })
                        }
                        className={BUTTON_CLASS}
                      >
                        {t.smsPage.createContact}
                      </button>
                      <button type="button" onClick={() => setCreating(null)} className="text-xs text-soft hover:underline">
                        {t.smsPage.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(null);
                        setPicking(group.number);
                      }}
                      className={BUTTON_CLASS}
                    >
                      {t.smsPage.linkToContact}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPicking(null);
                        setCreating(group.number);
                      }}
                      className={BUTTON_CLASS}
                    >
                      {t.smsPage.newContact}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.smsPage.newTitle} count={newTexts.length}>
        {newTexts.length === 0 ? (
          <p className="text-sm text-soft">{t.smsPage.noNew}</p>
        ) : (
          <>
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await markSmsSeen(newTexts.map((n) => n.id));
                    router.refresh();
                  })
                }
                className={BUTTON_CLASS}
              >
                {t.smsPage.markAllSeen}
              </button>
            </div>
            <ul className="divide-y divide-card-border">
              {newTexts.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/contacts/${n.contactId}`}
                      onClick={() => void markSmsSeen([n.id])}
                      className="text-sm font-semibold text-ink hover:underline"
                    >
                      {n.contactName}
                    </Link>
                    <button
                      type="button"
                      onClick={() => openDialog(n.entry, { id: n.contactId, name: n.contactName })}
                      className="mt-0.5 block w-full rounded-md text-left hover:bg-black/[0.04]"
                    >
                      <span className="block whitespace-pre-wrap break-words text-sm text-ink">{n.text}</span>
                      <span className="mt-1 block text-xs text-soft" suppressHydrationWarning>
                        {t.smsPage.receivedAt} {fmt.format(new Date(n.receivedAt))}
                      </span>
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await markSmsSeen([n.id]);
                        router.refresh();
                      })
                    }
                    className="shrink-0 text-xs text-soft hover:text-ink hover:underline"
                  >
                    {t.smsPage.markSeen}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {dialog && (
        <CallsSmsDialog
          key={dialog.key}
          entry={dialog.entry}
          replyTo={dialog.replyTo}
          onReply={(to) => openDialog(null, dialog.contact, to)}
          contactId={dialog.contact?.id ?? null}
          contact={dialog.contact}
          contacts={contactOptions}
          relatedContacts={[]}
          teamMembers={[]}
          linkData={linkData}
          currentUserId={currentUserId}
          sending={{ ready: twilioReady, numbers: [] }}
          lang={lang}
          typeLabels={typeLabels}
          onClose={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
