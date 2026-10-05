"use client";

import { useState } from "react";

// A project can combine several types of work. This picks them and orders them
// (↑ ↓ or drag the ⠿ handle); the form posts one hidden `types` entry per type, in
// that order. The order is the order of the Details cards and of the phases.
export default function ProjectTypesPicker({
  options,
  initial,
  lang,
  onChange,
}: {
  options: { value: string; label: string }[];
  initial: string[];
  lang: "en" | "fr";
  onChange?: (types: string[]) => void;
}) {
  const fr = lang === "fr";
  const [selected, setSelected] = useState<string[]>(initial);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const available = options.filter((o) => !selected.includes(o.value));

  function commit(next: string[]) {
    setSelected(next);
    onChange?.(next);
  }
  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= selected.length) return;
    const next = [...selected];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  }

  return (
    <div>
      {selected.map((v) => (
        <input key={v} type="hidden" name="types" value={v} />
      ))}
      <ul className="space-y-1">
        {selected.map((v, i) => (
          <li
            key={v}
            draggable={armed === i}
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", v);
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              if (over !== i) setOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) move(dragFrom, i);
              setDragFrom(null);
              setOver(null);
              setArmed(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setOver(null);
              setArmed(null);
            }}
            className={`flex items-center gap-2 rounded-md border bg-field-bg px-2 py-1.5 text-sm text-ink ${over === i && dragFrom !== i ? "border-emerald-600 ring-2 ring-emerald-600" : "border-card-border"} ${dragFrom === i ? "opacity-50" : ""}`}
          >
            <span onMouseDown={() => setArmed(i)} onMouseUp={() => setArmed(null)} title={fr ? "Glisser pour déplacer" : "Drag to move"} className="cursor-grab select-none text-soft hover:text-ink" aria-hidden>
              ⠿
            </span>
            <span className="w-4 text-xs text-soft">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate font-medium">{label(v)}</span>
            <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} title={fr ? "Monter" : "Move up"} className="rounded border border-card-border px-1.5 py-0.5 text-xs text-soft hover:text-ink disabled:opacity-40">
              ↑
            </button>
            <button type="button" onClick={() => move(i, i + 1)} disabled={i === selected.length - 1} title={fr ? "Descendre" : "Move down"} className="rounded border border-card-border px-1.5 py-0.5 text-xs text-soft hover:text-ink disabled:opacity-40">
              ↓
            </button>
            <button
              type="button"
              onClick={() => commit(selected.filter((x) => x !== v))}
              disabled={selected.length <= 1}
              title={fr ? "Retirer" : "Remove"}
              className="rounded border border-card-border px-1.5 py-0.5 text-xs text-soft hover:text-red-600 disabled:opacity-40"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) commit([...selected, e.target.value]);
          }}
          className="mt-2 w-full rounded-md border border-dashed border-card-border bg-field-bg px-3 py-2 text-sm text-ink focus:border-amo-gold focus:outline-none"
        >
          <option value="">{fr ? "+ Ajouter un type de projet…" : "+ Add a project type…"}</option>
          {available.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
