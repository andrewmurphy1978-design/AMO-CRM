"use client";

import { useState, useTransition } from "react";
import { setMailboxAccessAction } from "@/actions/shared-mailboxes";

const OPTS = [
  { v: "NONE", en: "No access", fr: "Aucun accès" },
  { v: "READ", en: "Read only", fr: "Lecture seule" },
  { v: "SEND", en: "Read & send", fr: "Lecture et envoi" },
  { v: "COMPLETE", en: "Read, send & complete", fr: "Lecture, envoi et complétion" },
];

// Who may use one shared mailbox, and how far. Changes here show up in Team access too (same data).
export default function MailboxMembers({ mailboxId, members, initial, fr }: { mailboxId: string; members: { id: string; name: string }[]; initial: Record<string, string>; fr: boolean }) {
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (members.length === 0) return <p className="text-xs text-soft">{fr ? "Aucun membre d'équipe pour le moment." : "No team members yet."}</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-soft">{fr ? "Accès des membres" : "Member access"}</p>
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {members.map((m) => (
          <label key={m.id} className="flex items-center justify-between gap-2 text-sm text-ink">
            <span>{m.name}</span>
            <select value={value[m.id] ?? "NONE"} onChange={(e) => setValue({ ...value, [m.id]: e.target.value })} className="rounded-md border border-card-border bg-field-bg px-2 py-1 text-xs text-ink">
              {OPTS.map((o) => <option key={o.v} value={o.v}>{fr ? o.fr : o.en}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await setMailboxAccessAction(mailboxId, value); setMsg(r.error ?? r.success ?? ""); })}
          className="rounded-md border border-card-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-black/5 disabled:opacity-60">{pending ? "…" : fr ? "Enregistrer les accès" : "Save access"}</button>
        {msg && <span className="text-xs text-soft">{msg}</span>}
      </div>
    </div>
  );
}
