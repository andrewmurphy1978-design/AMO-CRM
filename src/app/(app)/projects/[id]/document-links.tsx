"use client";

import { useState, useTransition } from "react";
import { toggleDocumentLink, type DocumentKind, type LinkableKind } from "@/actions/document-links";
import type { Lang } from "@/lib/i18n/dictionaries";

export interface LinkableItem {
  id: string;
  title: string;
  meta: string;
  proposalId: string | null;
  invoiceId: string | null;
}

export interface Linkables {
  emails: LinkableItem[];
  events: LinkableItem[];
  calls: LinkableItem[];
}

// In a proposal's / invoice's edit dialog: tick the project's emails, calendar events
// and calls & texts that belong to this document. Saved as soon as you tick.
export default function DocumentLinks({ kind, docId, projectId, linkables, lang }: { kind: DocumentKind; docId: string; projectId: string; linkables: Linkables; lang: Lang }) {
  const fr = lang === "fr";
  const field = kind === "proposal" ? "proposalId" : "invoiceId";
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isLinked = (type: LinkableKind, item: LinkableItem) => local[`${type}:${item.id}`] ?? item[field] === docId;

  function toggle(type: LinkableKind, item: LinkableItem, linked: boolean) {
    setLocal((l) => ({ ...l, [`${type}:${item.id}`]: linked }));
    setError(null);
    startTransition(async () => {
      const res = await toggleDocumentLink(kind, docId, projectId, type, item.id, linked);
      if (res.error) {
        setError(res.error);
        setLocal((l) => ({ ...l, [`${type}:${item.id}`]: !linked }));
      }
    });
  }

  const sections: { type: LinkableKind; title: string; empty: string; items: LinkableItem[] }[] = [
    { type: "email", title: fr ? "Courriels" : "Emails", empty: fr ? "Aucun courriel lié à ce projet." : "No emails linked to this project.", items: linkables.emails },
    { type: "event", title: fr ? "Événements du calendrier" : "Calendar events", empty: fr ? "Aucun événement lié à ce projet." : "No calendar events linked to this project.", items: linkables.events },
    { type: "call", title: fr ? "Appels et textos" : "Calls & SMS", empty: fr ? "Aucun appel ni texto lié à ce projet." : "No calls or texts linked to this project.", items: linkables.calls },
  ];

  return (
    <div className="mt-6 space-y-4 border-t border-card-border pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-soft">
        {kind === "proposal" ? (fr ? "Éléments liés à cette soumission" : "Linked to this proposal") : fr ? "Éléments liés à cette facture" : "Linked to this invoice"}
        {pending && <span className="ml-2 normal-case text-soft">…</span>}
      </p>
      {sections.map((sec) => (
        <div key={sec.type}>
          <p className="text-xs font-semibold text-ink">{sec.title}</p>
          {sec.items.length === 0 ? (
            <p className="mt-1 text-xs text-soft">{sec.empty}</p>
          ) : (
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
              {sec.items.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={isLinked(sec.type, item)} onChange={(e) => toggle(sec.type, item, e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{item.title}</span>
                      <span className="block text-xs text-soft">{item.meta}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
