"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProjectSubscriptions, type SubscriptionInput } from "@/actions/project-subscriptions";
import Card from "@/components/section-card";
import type { Lang } from "@/lib/i18n/dictionaries";

const INPUT =
  "w-full min-w-0 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

// Apps & subscription fees the client pays the providers directly. Filled from the
// apps chosen in the Project details; the proposal's "Apps & subscription fees"
// section is built from this list.
export default function SubscriptionsCard({ projectId, initial, lang }: { projectId: string; initial: SubscriptionInput[]; lang: Lang }) {
  const fr = lang === "fr";
  const router = useRouter();
  const [rows, setRows] = useState<(SubscriptionInput & { key: number })[]>(() => initial.map((r, key) => ({ ...r, key })));
  const [nextKey, setNextKey] = useState(initial.length);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (key: number, patch: Partial<SubscriptionInput>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  return (
    <Card
      color="general"
      title={fr ? "Applications et abonnements" : "Apps & subscriptions"}
      compact
      actions={
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await saveProjectSubscriptions(projectId, rows);
                  setDirty(false);
                  router.refresh();
                })
              }
              className="rounded-md bg-white/25 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-white/35 disabled:opacity-60"
            >
              {pending ? "…" : fr ? "Enregistrer" : "Save"}
            </button>
          )}
          <button
            type="button"
            title={fr ? "Ajouter" : "Add"}
            aria-label={fr ? "Ajouter" : "Add"}
            onClick={() => {
              setRows((rs) => [...rs, { key: nextKey, name: "", amount: 0, period: "month", note: "" }]);
              setNextKey((k) => k + 1);
              setDirty(true);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20"
          >
            +
          </button>
        </div>
      }
    >
      {rows.length === 0 && <p className="text-sm text-soft">{fr ? "Aucune application pour l'instant." : "No apps yet."}</p>}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_5rem_5.5rem_auto] items-center gap-1.5">
            <input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder={fr ? "Application / service" : "App / service"} className={INPUT} />
            <input type="number" min="0" step="0.01" value={r.amount} onChange={(e) => update(r.key, { amount: Number(e.target.value) })} className={INPUT} />
            <select value={r.period} onChange={(e) => update(r.key, { period: e.target.value })} className={INPUT}>
              <option value="month">{fr ? "/ mois" : "/ month"}</option>
              <option value="year">{fr ? "/ an" : "/ year"}</option>
              <option value="once">{fr ? "unique" : "one-time"}</option>
            </select>
            <button
              type="button"
              title={fr ? "Supprimer" : "Delete"}
              aria-label={fr ? "Supprimer" : "Delete"}
              onClick={() => {
                setRows((rs) => rs.filter((x) => x.key !== r.key));
                setDirty(true);
              }}
              className="rounded-md border border-card-border px-2 py-1.5 text-red-600 hover:bg-black/5"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
              </svg>
            </button>
            <input value={r.note} onChange={(e) => update(r.key, { note: e.target.value })} placeholder={fr ? "Note (facultatif)" : "Note (optional)"} className={`${INPUT} col-span-4 text-xs`} />
          </div>
        ))}
      </div>
    </Card>
  );
}
