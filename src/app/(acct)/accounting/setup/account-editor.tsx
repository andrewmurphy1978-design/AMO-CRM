"use client";

import { useState, useTransition } from "react";
import { setAccountGifi, setAccountNames, setAccountParent, setAccountSection } from "@/actions/accounting";
import { ASSET_SECTIONS, LIABILITY_SECTIONS } from "@/lib/accounting/charts";

export interface EditableAccount {
  id: string;
  code: string;
  name: string;
  nameFr: string;
  type: string;
  section: string | null;
  parentId: string | null;
  gifi: string | null;
  hasChildren: boolean;
  isGroup: boolean;
  bank: boolean;
  parentChoices: { id: string; label: string }[];
}

// One line of the chart of accounts: balance-sheet section (assets / liabilities), sub-category parent, and GIFI code.
export default function AccountEditor({ account: a, lang, showGifi }: { account: EditableAccount; lang: "en" | "fr"; showGifi: boolean }) {
  const fr = lang === "fr";
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gifi, setGifi] = useState(a.gifi ?? "");
  const [en, setEn] = useState(a.name);
  const [frName, setFrName] = useState(a.nameFr);
  const saveNames = () => (en !== a.name || frName !== a.nameFr) && start(async () => setError((await setAccountNames(a.id, en, frName)).error ?? null));
  const sections = a.type === "ASSET" ? ASSET_SECTIONS : a.type === "LIABILITY" ? LIABILITY_SECTIONS : null;
  const cls = "rounded-lg border border-card-border bg-white px-2 py-1 text-xs text-ink";
  const isGroup = a.isGroup;
  return (
    <div className={`${rowGrid(showGifi)} py-1.5`}>
      <span className={`text-xs text-soft ${a.parentId ? "pl-4" : ""}`}>{a.code}</span>
      <input value={en} onChange={(e) => setEn(e.target.value)} onBlur={saveNames} disabled={pending} placeholder="English" aria-label="English description" className={`${cls} w-full min-w-0 text-sm ${isGroup ? "font-semibold" : ""}`} />
      <input value={frName} onChange={(e) => setFrName(e.target.value)} onBlur={saveNames} disabled={pending} placeholder="Français" aria-label="Description française" className={`${cls} w-full min-w-0 text-sm ${isGroup ? "font-semibold" : ""}`} />
      {sections && !a.parentId ? (
        <select disabled={pending} value={a.section ?? ""} onChange={(e) => start(() => setAccountSection(a.id, e.target.value || null))} className={`${cls} w-full min-w-0`} title={fr ? "Section du bilan" : "Balance-sheet section"}>
          <option value="">{fr ? "Section automatique" : "Automatic section"}</option>
          {sections.map((s) => <option key={s.key} value={s.key}>{s[lang]}</option>)}
        </select>
      ) : (
        <span className="hidden lg:block" />
      )}
      {!a.bank && !a.hasChildren ? (
        <select
          disabled={pending}
          value={a.parentId ?? ""}
          onChange={(e) => start(async () => setError((await setAccountParent(a.id, e.target.value || null)).error ?? null))}
          className={`${cls} w-full min-w-0`}
          title={fr ? "Deuxième niveau : sous…" : "Second level: under…"}
        >
          <option value="">{fr ? "Premier niveau" : "Top level"}</option>
          {a.parentChoices.map((p) => <option key={p.id} value={p.id}>{fr ? "Sous " : "Under "}{p.label}</option>)}
        </select>
      ) : (
        <span className="hidden lg:block" />
      )}
      {showGifi &&
        (isGroup ? (
          <span className="hidden lg:block" />
        ) : (
          <input
            value={gifi}
            maxLength={4}
            placeholder="GIFI"
            disabled={pending}
            onChange={(e) => setGifi(e.target.value.replace(/\D/g, ""))}
            onBlur={() => gifi !== (a.gifi ?? "") && start(async () => setError((await setAccountGifi(a.id, gifi)).error ?? null))}
            className={`${cls} w-full min-w-0`}
            title="GIFI"
          />
        ))}
      {error && <span className="text-xs text-red-600 lg:col-span-full">{error}</span>}
    </div>
  );
}

// One grid for the header and every row, so the columns line up and fill the card.
export function rowGrid(showGifi: boolean): string {
  return showGifi
    ? "grid grid-cols-1 items-center gap-2 lg:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)_12rem_12rem_4.5rem]"
    : "grid grid-cols-1 items-center gap-2 lg:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)_12rem_12rem]";
}

export function AccountColumnsHeader({ lang, showGifi }: { lang: "en" | "fr"; showGifi: boolean }) {
  const fr = lang === "fr";
  return (
    <div className={`${rowGrid(showGifi)} hidden border-b border-card-border pb-1 text-xs font-semibold uppercase tracking-wide text-soft lg:grid`}>
      <span>Code</span>
      <span>{fr ? "Description anglaise" : "English description"}</span>
      <span>{fr ? "Description française" : "French description"}</span>
      <span>{fr ? "Section du bilan" : "Balance-sheet section"}</span>
      <span>{fr ? "Deuxième niveau" : "Second level"}</span>
      {showGifi && <span>GIFI</span>}
    </div>
  );
}
