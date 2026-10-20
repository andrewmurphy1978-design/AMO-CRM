"use client";

import { useMemo, useState, useTransition } from "react";
import { setFxRate, categorizeTransactions, confirmSuggestions, deleteTransactions, ignoreTransactions, suggestWithAI, uncategorizeTransactions, updateSupplier } from "@/actions/accounting";
import type { AccountOption, EntityInfo } from "@/lib/accounting/options";
import { GROUP_LABEL } from "@/lib/accounting/options";
import { money } from "@/lib/accounting/format";

export interface TxRow {
  id: string;
  date: string;
  description: string;
  supplier: string;
  amount: number;
  currency: string;
  entityCurrency: string;
  fxRate: number;
  accountId: string;
  status: string;
  by: string | null;
  categoryText: string;
  suggestionText: string;
  suggestion: { entityId: string; accountId: string; pct?: number }[] | null;
}

type Line = { pick: string; pct: number; tax: boolean };
const enc = (entityId: string, accountId: string) => `${entityId}|${accountId}`;

function CategoryPicker({ value, onChange, entities, options, lang }: { value: string; onChange: (v: string) => void; entities: EntityInfo[]; options: AccountOption[]; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full min-w-48 rounded-lg border border-card-border bg-white px-2 py-1.5 text-sm text-ink">
      <option value="">{fr ? "— Choisir une catégorie —" : "— Choose a category —"}</option>
      {entities.map((e) =>
        (["EXPENSE", "INCOME", "TRANSFER", "LIABILITY", "ASSET", "EQUITY"] as const).map((g) => {
          const list = options.filter((o) => o.entityId === e.id && o.group === g);
          if (list.length === 0) return null;
          return (
            <optgroup key={`${e.id}${g}`} label={`${e.name} — ${GROUP_LABEL[g][lang]}`}>
              {list.map((o) => (
                <option key={o.id} value={enc(e.id, o.id)}>
                  {o.code} {fr ? o.labelFr : o.label}
                </option>
              ))}
            </optgroup>
          );
        })
      )}
    </select>
  );
}

export default function TransactionsTable({
  lang,
  entities,
  options,
  banks,
  pending,
  done,
  doneCount,
  filters,
}: {
  lang: "en" | "fr";
  entities: EntityInfo[];
  options: AccountOption[];
  banks: { id: string; name: string; entityId: string }[];
  pending: TxRow[];
  done: TxRow[];
  doneCount: number;
  filters: { account: string; q: string; year: string; show: string };
}) {
  const fr = lang === "fr";
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const [bulk, setBulk] = useState("");
  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const bankName = useMemo(() => new Map(banks.map((b) => [b.id, b.name])), [banks]);

  const linesFor = (t: TxRow): Line[] => {
    if (lines[t.id]) return lines[t.id];
    if (t.suggestion?.length) return t.suggestion.map((s) => ({ pick: enc(s.entityId, s.accountId), pct: s.pct ?? 100, tax: false }));
    return [{ pick: "", pct: 100, tax: false }];
  };
  const setLinesFor = (id: string, l: Line[]) => setLines((prev) => ({ ...prev, [id]: l }));

  const payload = (ls: Line[]) =>
    ls.map((l) => {
      const [entityId, accountId] = l.pick.split("|");
      const e = entityById.get(entityId);
      return { entityId, accountId, pct: l.pct, tax: l.tax && e?.salesTaxRegistered ? (e.province ?? "QC") : null };
    });

  const run = (fn: () => Promise<string | void>) =>
    startTransition(async () => {
      setMessage(null);
      const m = await fn();
      if (m) setMessage(m);
    });

  const save = (t: TxRow) => {
    const ls = linesFor(t);
    if (ls.some((l) => !l.pick)) return setMessage(fr ? "Choisissez une catégorie." : "Choose a category.");
    run(async () => {
      const r = await categorizeTransactions({ txIds: [t.id], allocations: payload(ls), remember });
      if (r.error) return r.error;
      return remember && r.autoPosted ? (fr ? `Catégorisé. ${r.autoPosted} autre(s) transaction(s) du même fournisseur catégorisée(s) automatiquement.` : `Done. ${r.autoPosted} other transaction(s) from the same supplier were categorized automatically.`) : undefined;
    });
  };

  const applyBulk = () => {
    if (!bulk || selected.size === 0) return;
    run(async () => {
      const r = await categorizeTransactions({ txIds: [...selected], allocations: payload([{ pick: bulk, pct: 100, tax: false }]), remember });
      setSelected(new Set());
      return r.error ?? (r.autoPosted ? (fr ? `${r.autoPosted} autre(s) catégorisée(s) automatiquement.` : `${r.autoPosted} other(s) categorized automatically.`) : undefined);
    });
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const suggestedSelected = pending.filter((t) => selected.has(t.id) && t.status === "SUGGESTED").map((t) => t.id);

  return (
    <div className="space-y-6">
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-card-border bg-card-bg p-4 text-sm shadow-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? "Compte" : "Account"}</span>
          <select name="account" defaultValue={filters.account} className="rounded-lg border border-card-border bg-white px-2 py-1.5">
            <option value="">{fr ? "Tous" : "All"}</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? "Année" : "Year"}</span>
          <input name="year" defaultValue={filters.year} placeholder="2026" className="w-24 rounded-lg border border-card-border bg-white px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? "Fournisseur / description" : "Supplier / description"}</span>
          <input name="q" defaultValue={filters.q} className="w-56 rounded-lg border border-card-border bg-white px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-soft">{fr ? "Catégorisées" : "Categorized"}</span>
          <select name="show" defaultValue={filters.show} className="rounded-lg border border-card-border bg-white px-2 py-1.5">
            <option value="">{fr ? "Comptabilisées" : "Posted"}</option>
            <option value="ignored">{fr ? "Ignorées" : "Ignored"}</option>
          </select>
        </label>
        <button className="btn-primary rounded-lg px-4 py-1.5 font-semibold">{fr ? "Filtrer" : "Filter"}</button>
      </form>

      {message && <p className="rounded-lg bg-black/5 px-3 py-2 text-sm text-ink">{message}</p>}

      <section className="rounded-2xl border border-amber-300 bg-card-bg p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            {fr ? "À catégoriser" : "To categorize"}
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-semibold text-white">{pending.length}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-soft">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              {fr ? "Mémoriser pour ce fournisseur" : "Remember for this supplier"}
            </label>
            {pending.some((t) => t.status === "SUGGESTED") && (
              <button
                disabled={busy}
                onClick={() => run(async () => { const r = await confirmSuggestions(pending.filter((t) => t.status === "SUGGESTED").map((t) => t.id)); return r.error ?? (fr ? `${r.posted ?? 0} transaction(s) confirmée(s).` : `${r.posted ?? 0} transaction(s) confirmed.`); })}
                className="btn-primary rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
              >
                {fr ? "Confirmer toutes les suggestions" : "Confirm all suggestions"}
              </button>
            )}
            <button
              disabled={busy || pending.every((t) => t.status !== "NEW")}
              onClick={() => run(async () => { const r = await suggestWithAI(); return r.error ?? r.success; })}
              className="rounded-lg border border-card-border px-3 py-1.5 font-medium text-ink hover:bg-black/5 disabled:opacity-50"
            >
              {busy ? "…" : fr ? "Suggestions IA" : "Suggest with AI"}
            </button>
          </div>
        </div>

        {pending.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <button className="text-soft underline" onClick={() => setSelected(selected.size === pending.length ? new Set() : new Set(pending.map((t) => t.id)))}>
              {selected.size === pending.length ? (fr ? "Tout désélectionner" : "Clear selection") : fr ? "Tout sélectionner" : "Select all"}
            </button>
            {selected.size > 0 && (
              <>
                <span className="text-soft">{selected.size} {fr ? "sélectionnée(s)" : "selected"}:</span>
                <CategoryPicker value={bulk} onChange={setBulk} entities={entities} options={options} lang={lang} />
                <button disabled={busy || !bulk} onClick={applyBulk} className="btn-primary rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">
                  {fr ? "Appliquer" : "Apply"}
                </button>
                {suggestedSelected.length > 0 && (
                  <button disabled={busy} onClick={() => run(async () => { await confirmSuggestions(suggestedSelected); setSelected(new Set()); })} className="rounded-lg border border-card-border px-3 py-1.5 hover:bg-black/5">
                    {fr ? "Confirmer les suggestions" : "Confirm suggestions"}
                  </button>
                )}
                <button disabled={busy} onClick={() => run(async () => { await ignoreTransactions([...selected], true); setSelected(new Set()); })} className="rounded-lg border border-card-border px-3 py-1.5 hover:bg-black/5">
                  {fr ? "Ignorer" : "Ignore"}
                </button>
              </>
            )}
          </div>
        )}

        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-soft">{fr ? "Tout est catégorisé. 🎉" : "Everything is categorized. 🎉"}</p>
        ) : (
          <ul className="mt-3 divide-y divide-card-border">
            {pending.map((t) => {
              const ls = linesFor(t);
              const split = ls.length > 1;
              return (
                <li key={t.id} className="py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <input type="checkbox" className="mt-2" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                    <div className="w-24 shrink-0 pt-1 text-sm text-soft">{t.date}</div>
                    <div className="min-w-48 flex-1">
                      <SupplierName t={t} disabled={busy} onRename={(n) => run(async () => { await updateSupplier(t.id, n); })} />
                      <p className="text-xs text-soft break-words">{t.description} · {bankName.get(t.accountId)}</p>
                      {t.status === "SUGGESTED" && t.suggestionText && <p className="text-xs text-amber-700">{fr ? "Suggestion : " : "Suggested: "}{t.suggestionText}</p>}
                    </div>
                    <div className={`w-28 shrink-0 pt-1 text-right text-sm font-semibold ${t.amount < 0 ? "text-ink" : "text-emerald-700"}`}>{money(t.amount, t.currency, lang)}
                      {t.currency !== t.entityCurrency && (
                        <label className="mt-1 block text-xs font-normal text-soft" title={fr ? "Taux de change" : "Exchange rate"}>
                          × <input type="number" step="0.0001" defaultValue={t.fxRate} className="w-20 rounded border border-card-border px-1 py-0.5" onBlur={(e) => { const r = Number(e.target.value); if (r > 0 && r !== t.fxRate) run(async () => (await setFxRate([t.id], r)).error); }} /> {t.entityCurrency}
                        </label>
                      )}
                    </div>
                    <div className="flex min-w-72 flex-1 flex-col gap-1.5">
                      {ls.map((l, i) => {
                        const ent = entityById.get(l.pick.split("|")[0]);
                        return (
                          <div key={i} className="flex flex-wrap items-center gap-2">
                            <CategoryPicker value={l.pick} onChange={(v) => setLinesFor(t.id, ls.map((x, j) => (j === i ? { ...x, pick: v } : x)))} entities={entities} options={options} lang={lang} />
                            {split && (
                              <span className="flex items-center gap-1 text-sm">
                                <input type="number" min={1} max={100} value={l.pct} onChange={(e) => setLinesFor(t.id, ls.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)))} className="w-16 rounded-lg border border-card-border px-2 py-1" />%
                              </span>
                            )}
                            {ent?.salesTaxRegistered && (
                              <label className="flex items-center gap-1 text-xs text-soft">
                                <input type="checkbox" checked={l.tax} onChange={(e) => setLinesFor(t.id, ls.map((x, j) => (j === i ? { ...x, tax: e.target.checked } : x)))} />
                                {fr ? "taxes incluses" : "tax included"}
                              </label>
                            )}
                            {split && (
                              <button className="text-xs text-red-600" onClick={() => setLinesFor(t.id, ls.filter((_, j) => j !== i))}>✕</button>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-3 text-xs">
                        <button
                          className="text-soft underline"
                          onClick={() => {
                            const half = split ? ls : ls.map((l) => ({ ...l, pct: 50 }));
                            setLinesFor(t.id, [...half, { pick: "", pct: split ? Math.max(0, 100 - ls.reduce((s, l) => s + l.pct, 0)) : 50, tax: false }]);
                          }}
                        >
                          {fr ? "+ Répartir (ex. perso / entreprise)" : "+ Split (e.g. personal / business)"}
                        </button>
                        {split && <span className={ls.reduce((s, l) => s + l.pct, 0) === 100 ? "text-soft" : "text-red-600"}>Σ {ls.reduce((s, l) => s + l.pct, 0)}%</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button disabled={busy} onClick={() => save(t)} className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
                        {t.status === "SUGGESTED" ? (fr ? "Confirmer" : "Confirm") : fr ? "Enregistrer" : "Save"}
                      </button>
                      <button disabled={busy} title={fr ? "Ignorer" : "Ignore"} onClick={() => run(async () => { await ignoreTransactions([t.id], true); })} className="rounded-lg border border-card-border px-2 py-1.5 text-sm text-soft hover:bg-black/5">⊘</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-card-border bg-card-bg p-4 shadow-sm">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          {filters.show === "ignored" ? (fr ? "Ignorées" : "Ignored") : fr ? "Catégorisées" : "Categorized"}
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-2 text-xs font-semibold text-white">{doneCount}</span>
        </h2>
        {done.length === 0 ? (
          <p className="mt-3 text-sm text-soft">{fr ? "Rien à afficher." : "Nothing to show."}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-soft">
                  <th className="py-1 pr-3">{fr ? "Date" : "Date"}</th>
                  <th className="pr-3">{fr ? "Fournisseur" : "Supplier"}</th>
                  <th className="pr-3">{fr ? "Catégorie" : "Category"}</th>
                  <th className="pr-3 text-right">{fr ? "Montant" : "Amount"}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {done.map((t) => (
                  <tr key={t.id}>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-soft">{t.date}</td>
                    <td className="pr-3 text-ink">{t.supplier}<span className="block max-w-md text-xs text-soft break-words">{t.description}</span></td>
                    <td className="pr-3 text-soft">
                      {t.status === "IGNORED" ? (fr ? "(ignorée)" : "(ignored)") : t.categoryText}
                      {t.by === "RULE" && <span className="ml-1 rounded bg-emerald-50 px-1 text-xs text-emerald-700">{fr ? "auto" : "auto"}</span>}
                    </td>
                    <td className={`pr-3 text-right whitespace-nowrap ${t.amount < 0 ? "text-ink" : "text-emerald-700"}`}>{money(t.amount, t.currency, lang)}{t.currency !== t.entityCurrency && <span className="block text-xs text-soft">× {t.fxRate} {t.entityCurrency}</span>}</td>
                    <td className="space-x-2 text-right whitespace-nowrap text-xs">
                      <button disabled={busy} className="text-soft underline" onClick={() => run(async () => { if (t.status === "IGNORED") await ignoreTransactions([t.id], false); else await uncategorizeTransactions([t.id]); })}>
                        {fr ? "Modifier" : "Change"}
                      </button>
                      <button disabled={busy} className="text-red-600" onClick={() => { if (confirm(fr ? "Supprimer cette transaction ?" : "Delete this transaction?")) run(async () => { await deleteTransactions([t.id]); }); }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {doneCount > done.length && <p className="mt-2 text-xs text-soft">{fr ? `Les ${done.length} plus récentes sur ${doneCount} — utilisez les filtres pour voir les autres.` : `Showing the most recent ${done.length} of ${doneCount} — use the filters to see others.`}</p>}
          </div>
        )}
      </section>
    </div>
  );
}

function SupplierName({ t, onRename, disabled }: { t: TxRow; onRename: (n: string) => void; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(t.supplier);
  if (!editing)
    return (
      <button className="text-left text-sm font-medium text-ink hover:underline" title="Rename supplier" onClick={() => setEditing(true)}>
        {t.supplier}
      </button>
    );
  return (
    <input
      autoFocus
      disabled={disabled}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (val.trim() && val !== t.supplier) onRename(val);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="w-full rounded-lg border border-card-border px-2 py-1 text-sm"
    />
  );
}
