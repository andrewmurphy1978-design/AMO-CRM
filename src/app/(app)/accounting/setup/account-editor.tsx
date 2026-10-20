"use client";

import { useState, useTransition } from "react";
import { setAccountGifi, setAccountParent, setAccountSection } from "@/actions/accounting";
import { ASSET_SECTIONS, LIABILITY_SECTIONS } from "@/lib/accounting/charts";

export interface EditableAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  section: string | null;
  parentId: string | null;
  gifi: string | null;
  hasChildren: boolean;
  bank: boolean;
  parentChoices: { id: string; label: string }[];
}

// One line of the chart of accounts: balance-sheet section (assets / liabilities), sub-category parent, and GIFI code.
export default function AccountEditor({ account: a, lang, showGifi }: { account: EditableAccount; lang: "en" | "fr"; showGifi: boolean }) {
  const fr = lang === "fr";
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gifi, setGifi] = useState(a.gifi ?? "");
  const sections = a.type === "ASSET" ? ASSET_SECTIONS : a.type === "LIABILITY" ? LIABILITY_SECTIONS : null;
  const cls = "rounded-lg border border-card-border bg-white px-2 py-1 text-xs text-ink";
  return (
    <div className={`flex flex-wrap items-center gap-2 py-1.5 ${a.parentId ? "pl-6" : ""}`}>
      <span className="w-14 shrink-0 text-xs text-soft">{a.code}</span>
      <span className="min-w-40 flex-1 text-sm text-ink">{a.name}</span>
      {sections && (
        <select disabled={pending} value={a.section ?? ""} onChange={(e) => start(() => setAccountSection(a.id, e.target.value || null))} className={cls} title={fr ? "Section du bilan" : "Balance-sheet section"}>
          <option value="">{fr ? "Section automatique" : "Automatic section"}</option>
          {sections.map((s) => <option key={s.key} value={s.key}>{s[lang].split(" (")[0]}</option>)}
        </select>
      )}
      {!a.bank && !a.hasChildren && (
        <select
          disabled={pending}
          value={a.parentId ?? ""}
          onChange={(e) => start(async () => setError((await setAccountParent(a.id, e.target.value || null)).error ?? null))}
          className={cls}
          title={fr ? "Sous-catégorie de…" : "Sub-category of…"}
        >
          <option value="">{fr ? "Catégorie principale" : "Top-level"}</option>
          {a.parentChoices.map((p) => <option key={p.id} value={p.id}>{fr ? "Sous-catégorie de " : "Under "}{p.label}</option>)}
        </select>
      )}
      {showGifi && (
        <input
          value={gifi}
          maxLength={4}
          placeholder="GIFI"
          disabled={pending}
          onChange={(e) => setGifi(e.target.value.replace(/\D/g, ""))}
          onBlur={() => gifi !== (a.gifi ?? "") && start(async () => setError((await setAccountGifi(a.id, gifi)).error ?? null))}
          className={`${cls} w-16`}
          title="GIFI"
        />
      )}
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
    </div>
  );
}
