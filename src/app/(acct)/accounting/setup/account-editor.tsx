"use client";

import { useState, useTransition } from "react";
import { deleteAccount, setAccountCode, setAccountGifi, saveOppositeAccount, setAccountNames, setAccountParent, setAccountSection } from "@/actions/accounting";
import { ASSET_SECTIONS, LIABILITY_SECTIONS } from "@/lib/accounting/charts";
import AccountingDialog from "../accounting-dialog";
import { FIELD_CLASS, LABEL_CLASS } from "@/app/(app)/contacts/[id]/section-dialog";

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
  twoWay: boolean;
  altCode: string | null;
  altName: string | null;
  altNameFr: string | null;
  bank: boolean;
  parentChoices: { id: string; label: string }[];
}

// One line of the chart of accounts: balance-sheet section (assets / liabilities), sub-category parent, and GIFI code.
export default function AccountEditor({ account: a, lang, showGifi, depth = 0 }: { account: EditableAccount; lang: "en" | "fr"; showGifi: boolean; depth?: number }) {
  const fr = lang === "fr";
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(a.code);
  const [oppositeOpen, setOppositeOpen] = useState(false);
  const [gifi, setGifi] = useState(a.gifi ?? "");
  const [en, setEn] = useState(a.name);
  const [frName, setFrName] = useState(a.nameFr);
  const saveNames = () => (en !== a.name || frName !== a.nameFr) && start(async () => setError((await setAccountNames(a.id, en, frName)).error ?? null));
  const sections = a.type === "ASSET" ? ASSET_SECTIONS : a.type === "LIABILITY" ? LIABILITY_SECTIONS : null;
  const cls = "rounded-lg border border-card-border bg-white px-2 py-1 text-xs text-ink";
  const isGroup = a.isGroup;
  const oppositeAction = async (_prev: { error?: string; success?: string } | undefined, fd: FormData) =>
    saveOppositeAccount(a.id, { twoWay: fd.get("twoWay") === "on", altCode: String(fd.get("altCode") ?? ""), altName: String(fd.get("altName") ?? ""), altNameFr: String(fd.get("altNameFr") ?? "") });
  return (
    <div className={`${rowGrid(showGifi)} py-1.5`}>
      {oppositeOpen && (
        <AccountingDialog open onOpenChange={setOppositeOpen} title={fr ? "Compte opposé" : "Opposite account"} action={oppositeAction} lang={lang} color="billing">
          <p className="text-sm text-soft">
            {fr
              ? `« ${a.name} » reste ${a.type === "ASSET" ? "un actif" : "un passif"} tant que son solde est normal. S'il change de sens (un prêt devenu une dette, un remboursement d'impôt devenu un impôt à payer), il passe de l'autre côté du bilan, dans la section correspondante, avec le numéro et les noms choisis ici.`
              : `“${a.name}” stays ${a.type === "ASSET" ? "an asset" : "a liability"} while its balance is normal. If it changes sign (a loan that became a debt, a tax refund that became tax owed) it moves to the other side of the balance sheet, in the matching section, with the number and names chosen here.`}
          </p>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="twoWay" defaultChecked={a.twoWay} className="accent-amo-lime" /> {fr ? "C'est un compte opposé" : "This is an opposite account"}</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>{fr ? "Numéro de l'autre côté" : "Number on the other side"}</label>
              <input name="altCode" defaultValue={a.altCode ?? ""} maxLength={6} inputMode="numeric" placeholder={a.code} className={FIELD_CLASS} />
            </div>
            <span className="hidden sm:block" />
            <div>
              <label className={LABEL_CLASS}>{fr ? "Nom anglais de l'autre côté" : "English name on the other side"}</label>
              <input name="altName" defaultValue={a.altName ?? ""} placeholder={a.name} className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>{fr ? "Nom français de l'autre côté" : "French name on the other side"}</label>
              <input name="altNameFr" defaultValue={a.altNameFr ?? ""} placeholder={a.nameFr} className={FIELD_CLASS} />
            </div>
          </div>
        </AccountingDialog>
      )}
      <div style={{ paddingLeft: depth * 14 }}>
        <input
          value={code}
          maxLength={6}
          inputMode="numeric"
          disabled={pending}
          aria-label="Code"
          title={fr ? "Code du compte (3 à 6 chiffres)" : "Account code (3 to 6 digits)"}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onBlur={() => {
            if (code === a.code) return;
            start(async () => {
              const r = await setAccountCode(a.id, code);
              if (r.error) {
                setError(r.error);
                setCode(a.code);
              } else setError(null);
            });
          }}
          className={`${cls} w-full min-w-0 px-1.5 text-center text-xs`}
        />
      </div>
      <input value={en} onChange={(e) => setEn(e.target.value)} onBlur={saveNames} disabled={pending} placeholder="English" aria-label="English description" className={`${cls} w-full min-w-0 text-sm ${depth === 0 ? "font-semibold" : ""}`} />
      <input value={frName} onChange={(e) => setFrName(e.target.value)} onBlur={saveNames} disabled={pending} placeholder="Français" aria-label="Description française" className={`${cls} w-full min-w-0 text-sm ${depth === 0 ? "font-semibold" : ""}`} />
      {sections && !a.parentId ? (
        <div className="flex min-w-0 items-center gap-1">
        <select disabled={pending} value={a.section ?? ""} onChange={(e) => start(() => setAccountSection(a.id, e.target.value || null))} className={`${cls} w-full min-w-0`} title={fr ? "Section du bilan" : "Balance-sheet section"}>
          <option value="">{fr ? "Section automatique" : "Automatic section"}</option>
          {sections.map((s) => <option key={s.key} value={s.key}>{s[lang]}</option>)}
        </select>
        {!a.bank && !isGroup && (
          <button
            type="button"
            onClick={() => setOppositeOpen(true)}
            title={fr ? "Compte opposé : passe de l'actif au passif (même section) quand le solde change de sens. Cliquer pour régler le numéro et les noms de l'autre côté." : "Opposite account: moves between assets and liabilities (same section) when its balance changes sign. Click to set its number and names on the other side."}
            className={`shrink-0 rounded-md border px-1.5 py-1 text-xs ${a.twoWay ? "border-amo-gold bg-amo-gold/20 font-bold text-ink" : "border-card-border text-soft hover:bg-black/5"}`}
          >
            ⇄
          </button>
        )}
        </div>
      ) : (
        <span className="hidden lg:block" />
      )}
      {!a.bank && a.parentChoices.length + (a.parentId ? 1 : 0) > 0 ? (
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
      {a.hasChildren ? (
        <span className="hidden lg:block" />
      ) : (
        <button
          type="button"
          disabled={pending}
          title={fr ? "Retirer ce compte (seulement s'il n'a aucune transaction)" : "Remove this account (only if it has no transactions)"}
          aria-label={fr ? "Retirer le compte" : "Remove the account"}
          onClick={() => {
            if (!confirm(fr ? `Retirer le compte ${a.code} ?` : `Remove account ${a.code}?`)) return;
            start(async () => setError((await deleteAccount(a.id)).error ?? null));
          }}
          className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          ✕
        </button>
      )}
      {error && <span className="text-xs text-red-600 lg:col-span-full">{error}</span>}
    </div>
  );
}

// One grid for the header and every row, so the columns line up and fill the card.
export function rowGrid(showGifi: boolean): string {
  return showGifi
    ? "grid grid-cols-1 items-center gap-2 lg:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_12rem_12rem_4.5rem_1.5rem]"
    : "grid grid-cols-1 items-center gap-2 lg:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_12rem_12rem_1.5rem]";
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
      <span />
    </div>
  );
}
