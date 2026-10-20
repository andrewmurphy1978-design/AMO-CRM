"use client";

import { useState, useTransition } from "react";
import { addManualEntry } from "@/actions/accounting";
import type { AccountOption, EntityInfo } from "@/lib/accounting/options";

type L = { accountId: string; debit: string; credit: string };

export default function JournalForm({ lang, entities, options }: { lang: "en" | "fr"; entities: EntityInfo[]; options: AccountOption[] }) {
  const fr = lang === "fr";
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [opening, setOpening] = useState(false);
  const [lines, setLines] = useState<L[]>([{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const accts = options.filter((o) => o.entityId === entityId);
  const d = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const c = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const set = (i: number, p: Partial<L>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const cls = "rounded-lg border border-card-border bg-white px-2 py-1.5 text-sm text-ink";

  const submit = () =>
    start(async () => {
      const r = await addManualEntry({ entityId, date, memo, opening, lines: lines.filter((l) => l.accountId).map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) });
      if (r.error) setMsg({ ok: false, text: r.error });
      else {
        setMsg({ ok: true, text: r.success ?? "" });
        setMemo("");
        setLines([{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }]);
      }
    });

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <select value={entityId} onChange={(e) => { setEntityId(e.target.value); setLines(lines.map((l) => ({ ...l, accountId: "" }))); }} className={cls}>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cls} />
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={fr ? "Description" : "Memo"} className={`${cls} min-w-60 flex-1`} />
        <label className="flex items-center gap-2 text-soft"><input type="checkbox" checked={opening} onChange={(e) => setOpening(e.target.checked)} /> {fr ? "Solde d'ouverture" : "Opening balance"}</label>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <select value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })} className={`${cls} min-w-64 flex-1`}>
            <option value="">—</option>
            {accts.map((o) => <option key={o.id} value={o.id}>{o.code} {fr ? o.labelFr : o.label}</option>)}
          </select>
          <input type="number" step="0.01" min="0" value={l.debit} onChange={(e) => set(i, { debit: e.target.value })} placeholder={fr ? "Débit" : "Debit"} className={`${cls} w-32`} />
          <input type="number" step="0.01" min="0" value={l.credit} onChange={(e) => set(i, { credit: e.target.value })} placeholder={fr ? "Crédit" : "Credit"} className={`${cls} w-32`} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button className="text-soft underline" onClick={() => setLines([...lines, { accountId: "", debit: "", credit: "" }])}>{fr ? "+ Ligne" : "+ Line"}</button>
        <span className={Math.abs(d - c) < 0.005 ? "text-soft" : "text-red-600"}>{fr ? "Débits" : "Debits"} {d.toFixed(2)} · {fr ? "Crédits" : "Credits"} {c.toFixed(2)}</span>
        <button disabled={busy} onClick={submit} className="btn-primary rounded-lg px-4 py-1.5 font-semibold disabled:opacity-50">{fr ? "Enregistrer" : "Save"}</button>
      </div>
      {msg && <p className={msg.ok ? "text-emerald-700" : "text-red-600"}>{msg.text}</p>}
    </div>
  );
}
