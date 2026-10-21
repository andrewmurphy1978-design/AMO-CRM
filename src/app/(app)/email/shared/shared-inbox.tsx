"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listSharedMessagesAction, fetchSharedMessageAction, sendSharedMessageAction, setSharedCompleteAction, downloadSharedAttachmentAction,
  type MyMailbox, type SharedMessage, type SharedDetail,
} from "@/actions/shared-mailboxes";
import { mailboxAtLeast } from "@/lib/mail/shared-levels";
import type { Lang } from "@/lib/i18n/dictionaries";

const FIELD = "w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink";
const BTN = "rounded-md border border-card-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-black/5 disabled:opacity-60";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const addrs = (s: string) => s.split(/[,;]/).map((a) => a.trim()).filter(Boolean);

export default function SharedInbox({ boxes, lang }: { boxes: MyMailbox[]; lang: Lang }) {
  const fr = lang === "fr";
  const [boxId, setBoxId] = useState(boxes[0]?.id ?? "");
  const box = boxes.find((b) => b.id === boxId);
  const [messages, setMessages] = useState<SharedMessage[]>([]);
  const [error, setError] = useState("");
  const [loading, startLoad] = useTransition();
  const [open, setOpen] = useState<SharedDetail | null>(null);
  const [compose, setCompose] = useState<{ to: string; cc: string; subject: string; body: string; inReplyTo: string | null; references: string[]; threadId: string | null } | null>(null);
  const [notice, setNotice] = useState("");
  const [sending, startSend] = useTransition();

  function refresh(id = boxId) {
    if (!id) return;
    setError("");
    startLoad(async () => {
      const r = await listSharedMessagesAction(id);
      if ("error" in r) { setError(r.error); setMessages([]); } else setMessages(r.messages);
    });
  }
  useEffect(() => {
    if (!boxId) return;
    let alive = true;
    void listSharedMessagesAction(boxId).then((r) => {
      if (!alive) return;
      if ("error" in r) { setError(r.error); setMessages([]); } else { setError(""); setMessages(r.messages); }
    });
    return () => { alive = false; };
  }, [boxId]);

  if (boxes.length === 0) {
    return <p className="text-sm text-soft">{fr ? "Aucune boîte partagée ne vous est accessible pour le moment." : "No shared mailbox has been shared with you yet."}</p>;
  }
  const canSend = box ? mailboxAtLeast(box.level, "SEND") : false;
  const canComplete = box ? mailboxAtLeast(box.level, "COMPLETE") : false;

  async function openMessage(key: string) {
    const r = await fetchSharedMessageAction(boxId, key);
    if ("error" in r) setError(r.error); else { setOpen(r); setCompose(null); setNotice(""); }
  }
  function reply(d: SharedDetail) {
    setCompose({
      to: d.from.email, cc: "", subject: /^re:/i.test(d.subject) ? d.subject : `Re: ${d.subject}`, body: "",
      inReplyTo: d.messageIdHeader, references: [...d.references, ...(d.messageIdHeader ? [d.messageIdHeader] : [])], threadId: d.threadId,
    });
  }
  function send() {
    if (!compose) return;
    startSend(async () => {
      const html = `<div>${esc(compose.body).replace(/\n/g, "<br>")}</div>`;
      const r = await sendSharedMessageAction(boxId, { to: addrs(compose.to), cc: addrs(compose.cc), subject: compose.subject, html, inReplyTo: compose.inReplyTo, references: compose.references, threadId: compose.threadId });
      if ("error" in r) setNotice(r.error); else { setNotice(fr ? "Envoyé." : "Sent."); setCompose(null); }
    });
  }
  async function toggleComplete(m: { key: string }, done: boolean) {
    await setSharedCompleteAction(boxId, m.key, done);
    setMessages((list) => list.map((x) => (x.key === m.key ? { ...x, completed: done } : x)));
  }
  async function download(key: string, i: number) {
    const r = await downloadSharedAttachmentAction(boxId, key, i);
    if ("error" in r) return setNotice(r.error);
    const a = document.createElement("a");
    a.href = `data:${r.mimeType};base64,${r.base64}`;
    a.download = r.filename;
    a.click();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={boxId} onChange={(e) => { setBoxId(e.target.value); setOpen(null); setCompose(null); }} className={`${FIELD} max-w-xs`}>
          {boxes.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.address}</option>)}
        </select>
        <button type="button" onClick={() => refresh()} disabled={loading} className={BTN}>{loading ? "…" : fr ? "Actualiser" : "Refresh"}</button>
        {canSend && (
          <button type="button" onClick={() => { setOpen(null); setCompose({ to: "", cc: "", subject: "", body: "", inReplyTo: null, references: [], threadId: null }); }} className={BTN}>{fr ? "Nouveau courriel" : "New email"}</button>
        )}
        <span className="text-xs text-soft">
          {box?.level === "READ" ? (fr ? "Lecture seule" : "Read only") : box?.level === "SEND" ? (fr ? "Lecture et envoi" : "Read & send") : fr ? "Lecture, envoi et complétion" : "Read, send & complete"}
        </span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-soft">{notice}</p>}

      {compose && canSend && (
        <div className="space-y-2 rounded-md border border-card-border p-3">
          <p className="text-xs text-soft">{fr ? "De" : "From"}: {box?.address}</p>
          <input className={FIELD} placeholder={fr ? "À (séparés par des virgules)" : "To (comma separated)"} value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} />
          <input className={FIELD} placeholder="Cc" value={compose.cc} onChange={(e) => setCompose({ ...compose, cc: e.target.value })} />
          <input className={FIELD} placeholder={fr ? "Objet" : "Subject"} value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
          <textarea className={FIELD} rows={8} value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} />
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={sending} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60">{sending ? "…" : fr ? "Envoyer" : "Send"}</button>
            <button type="button" onClick={() => setCompose(null)} className={BTN}>{fr ? "Annuler" : "Cancel"}</button>
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-2 rounded-md border border-card-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-ink">{open.subject || (fr ? "(sans objet)" : "(no subject)")}</p>
              <p className="text-xs text-soft">{open.from.name ? `${open.from.name} <${open.from.email}>` : open.from.email} · {open.date ? new Date(open.date).toLocaleString(fr ? "fr-CA" : "en-CA") : ""}</p>
              <p className="text-xs text-soft">{fr ? "À" : "To"}: {open.to.join(", ")}{open.cc.length ? ` · Cc: ${open.cc.join(", ")}` : ""}</p>
            </div>
            <div className="flex gap-2">
              {canSend && <button type="button" onClick={() => reply(open)} className={BTN}>{fr ? "Répondre" : "Reply"}</button>}
              <button type="button" onClick={() => setOpen(null)} className={BTN}>{fr ? "Fermer" : "Close"}</button>
            </div>
          </div>
          {open.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {open.attachments.map((a, i) => (
                <button key={i} type="button" onClick={() => download(open.key, i)} data-readonly-ok className={BTN}>📎 {a.filename}</button>
              ))}
            </div>
          )}
          {open.html ? (
            <iframe title="message" sandbox="" srcDoc={open.html} className="h-[28rem] w-full rounded border border-card-border bg-white" />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-ink">{open.text}</pre>
          )}
        </div>
      )}

      <ul className="divide-y divide-card-border rounded-md border border-card-border">
        {messages.map((m) => (
          <li key={m.key} className={`flex items-center gap-2 px-3 py-2 ${m.completed ? "opacity-60" : ""}`}>
            <button type="button" onClick={() => openMessage(m.key)} data-readonly-ok className="min-w-0 flex-1 text-left">
              <p className={`truncate text-sm ${m.seen ? "text-soft" : "font-semibold text-ink"}`}>{m.subject || (fr ? "(sans objet)" : "(no subject)")}</p>
              <p className="truncate text-xs text-soft">{m.from.name || m.from.email} · {m.date ? new Date(m.date).toLocaleString(fr ? "fr-CA" : "en-CA") : ""}{m.hasAttachments ? " · 📎" : ""}</p>
            </button>
            {canComplete && (
              <button type="button" onClick={() => toggleComplete(m, !m.completed)} data-readonly-ok className={BTN}>{m.completed ? (fr ? "Rouvrir" : "Reopen") : fr ? "✓ Complété" : "✓ Done"}</button>
            )}
            {!canComplete && m.completed && <span className="text-xs text-emerald-700">✓</span>}
          </li>
        ))}
        {messages.length === 0 && !loading && !error && <li className="px-3 py-4 text-sm text-soft">{fr ? "Aucun message." : "No messages."}</li>}
      </ul>
    </div>
  );
}
