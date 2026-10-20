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

// For each pair of entities: which account of one entity's books holds the money going to / from the other (a loan to or from it).
export default function RelationshipAccounts({ lang, rows }: { lang: "en" | "fr"; rows: RelationshipRow[] }) {
  const fr = lang === "fr";
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm text-soft">
        {fr
          ? "Quand une transaction d'une entité sert une autre (par exemple un compte personnel qui paie une dépense d'Andrew Murphy Online), l'écriture passe par un compte de prêt ou d'apport. Choisissez ici le compte à utiliser dans les livres de chaque entité ; « automatique » en crée un au besoin."
          : "When a transaction of one entity serves another (for example a personal account paying an Andrew Murphy Online expense), the entry goes through a loan or contribution account. Choose here which account to use in each entity's books; “automatic” creates one when needed."}
      </p>
      <div className="divide-y divide-card-border">
        {rows.map((r) => (
          <div key={`${r.entityId}-${r.otherId}`} className="grid gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
            <p className="text-sm text-ink">
              {fr ? "Dans les livres de " : "In the books of "}<b>{r.entityName}</b>{fr ? ", compte pour l'argent avec " : ", the account for money with "}<b>{r.otherName}</b>
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
