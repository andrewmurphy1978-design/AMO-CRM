"use client";

import { useState, useTransition } from "react";
import { setRelationshipAccount } from "@/actions/accounting";
import { FIELD_CLASS } from "@/app/(app)/contacts/[id]/section-dialog";

export interface RelationshipRow {
  entityId: string;
  entityName: string;
  otherId: string;
  otherName: string;
  current: string;
  choices: { id: string; label: string }[];
}

// Inside one entity's card: for each other entity, which account of this entity's books holds the money going to / from it (a loan or contribution).
export default function RelationshipAccounts({ lang, rows }: { lang: "en" | "fr"; rows: RelationshipRow[] }) {
  const fr = lang === "fr";
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase text-soft">{fr ? "Comptes entre entités (prêts et apports)" : "Accounts between entities (loans and contributions)"}</p>
      <div className="divide-y divide-card-border">
        {rows.map((r) => (
          <div key={`${r.entityId}-${r.otherId}`} className="grid gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
            <p className="text-sm text-ink">
              {fr ? "Compte pour l'argent avec " : "Account for money with "}<b>{r.otherName}</b>
            </p>
            <select
              disabled={pending}
              value={r.current}
              onChange={(e) => start(async () => setMsg((await setRelationshipAccount(r.entityId, r.otherId, e.target.value || null)).error ?? null))}
              className={FIELD_CLASS}
            >
              <option value="">{fr ? "Automatique" : "Automatic"}</option>
              {r.choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        ))}
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
