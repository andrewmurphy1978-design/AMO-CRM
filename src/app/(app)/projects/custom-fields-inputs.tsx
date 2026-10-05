"use client";

import { useState } from "react";
import { isFieldVisible, isMulti, optionsFor, type FieldTpl, type FieldValues } from "@/lib/project-templates";

const FIELD_CLASS =
  "mt-1 w-full min-w-0 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

// The inputs for a project type's custom fields. Every answer is submitted
// as `cf_<key>` (several of them for multi-choice fields); fields whose
// showIf condition isn't met are hidden and not submitted.
export default function CustomFieldsInputs({
  fields,
  initial,
  lang,
  prefix = "",
}: {
  fields: FieldTpl[];
  initial?: FieldValues;
  lang: "en" | "fr";
  // For a project with several types: `<TYPE>__` keeps each type's answers apart.
  prefix?: string;
}) {
  const [values, setValues] = useState<FieldValues>(initial ?? {});
  const [others, setOthers] = useState<Record<string, string>>({});
  const set = (key: string, v: string | string[]) => setValues((prev) => ({ ...prev, [key]: v }));
  const fr = lang === "fr";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {fields
        .filter((f) => isFieldVisible(f, values, fields) || f.keepSpace)
        .map((field) => {
          if (field.keepSpace && !isFieldVisible(field, values, fields)) return <div key={field.key} className="hidden md:block" aria-hidden />;
          const name = `cf_${prefix}${field.key}`;
          const v = values[field.key];
          if (field.type === "spacer") return <div key={field.key} className="hidden md:block" aria-hidden />;
          return (
            <div key={field.key} className="min-w-0">
              <label className={LABEL_CLASS}>{field.label}</label>

              {field.type === "yesno" && (
                <>
                  <select value={typeof v === "string" ? v : ""} onChange={(e) => set(field.key, e.target.value)} className={FIELD_CLASS}>
                    <option value="">—</option>
                    <option value="Y">{fr ? "Oui" : "Yes"}</option>
                    <option value="N">{fr ? "Non" : "No"}</option>
                  </select>
                  {typeof v === "string" && v && <input type="hidden" name={name} value={v} />}
                </>
              )}

              {(field.type === "text" || field.type === "url") && (
                <input
                  type={field.type === "url" ? "url" : "text"}
                  name={name}
                  value={typeof v === "string" ? v : ""}
                  onChange={(e) => set(field.key, e.target.value)}
                  className={FIELD_CLASS}
                />
              )}

              {field.type === "number" && (
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  name={name}
                  value={typeof v === "string" ? v : ""}
                  onChange={(e) => set(field.key, e.target.value)}
                  className={FIELD_CLASS}
                />
              )}

              {field.type === "counts" && (
                <CountsInput
                  name={name}
                  choices={(() => {
                    const src = field.of ? values[field.of] : undefined;
                    return Array.isArray(src) ? src : typeof src === "string" && src ? [src] : [];
                  })()}
                  value={Array.isArray(v) ? v : []}
                  onChange={(next) => set(field.key, next)}
                  fr={fr}
                />
              )}

              {field.type === "textarea" && (
                <textarea name={name} rows={3} value={typeof v === "string" ? v : ""} onChange={(e) => set(field.key, e.target.value)} className={FIELD_CLASS} />
              )}

              {field.type === "select" && (
                <select name={name} value={typeof v === "string" ? v : ""} onChange={(e) => set(field.key, e.target.value)} className={FIELD_CLASS}>
                  <option value="">—</option>
                  {optionsFor(field).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  {typeof v === "string" && v && !optionsFor(field).includes(v) && <option value={v}>{v}</option>}
                </select>
              )}

              {isMulti(field) && field.type !== "counts" && (
                <MultiChoice
                  field={field}
                  selected={Array.isArray(v) ? v : []}
                  onChange={(next) => set(field.key, next)}
                  otherText={others[field.key] ?? ""}
                  onOtherText={(t) => setOthers((prev) => ({ ...prev, [field.key]: t }))}
                  name={name}
                  fr={fr}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

// One spin-box per selected choice of another field (e.g. posts per week for each platform).
// Stored as "Choice: N" entries; choices left empty (or 0) are left out.
function CountsInput({ name, choices, value, onChange, fr }: { name: string; choices: string[]; value: string[]; onChange: (next: string[]) => void; fr: boolean }) {
  const parse = (entry: string): [string, string] => {
    const i = entry.lastIndexOf(":");
    return i === -1 ? [entry.trim(), ""] : [entry.slice(0, i).trim(), entry.slice(i + 1).trim()];
  };
  const map = new Map(value.map(parse));
  const setCount = (choice: string, n: string) => {
    const next = new Map(map);
    if (n === "") next.delete(choice);
    else next.set(choice, n);
    onChange(choices.filter((c) => next.has(c)).map((c) => `${c}: ${next.get(c)}`));
  };
  if (choices.length === 0) return <p className="mt-1 text-xs text-soft">{fr ? "Choisissez d'abord les options ci-dessus." : "Pick the choices above first."}</p>;
  return (
    <div className="mt-1 space-y-1.5">
      {choices.filter((c) => map.get(c)).map((c) => (
        <input key={c} type="hidden" name={name} value={`${c}: ${map.get(c)}`} />
      ))}
      {choices.map((c) => (
        <div key={c} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-sm text-ink">{c}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={map.get(c) ?? ""}
            onChange={(e) => setCount(c, e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
        </div>
      ))}
    </div>
  );
}

function MultiChoice({
  field,
  selected,
  onChange,
  otherText,
  onOtherText,
  name,
  fr,
}: {
  field: FieldTpl;
  selected: string[];
  onChange: (next: string[]) => void;
  otherText: string;
  onOtherText: (t: string) => void;
  name: string;
  fr: boolean;
}) {
  const options = optionsFor(field);
  const extras = selected.filter((s) => !options.includes(s));
  const all = [...options, ...extras];
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]);
  function addOther() {
    const text = otherText.trim();
    if (!text) return;
    if (!selected.includes(text)) onChange([...selected, text]);
    onOtherText("");
  }
  return (
    <div className="mt-1">
      {selected.map((s) => (
        <input key={s} type="hidden" name={name} value={s} />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {all.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-emerald-600 bg-emerald-600 text-white" : "border-card-border bg-field-bg text-ink hover:border-amo-gold"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {field.allowOther && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={otherText}
            onChange={(e) => onOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOther();
              }
            }}
            placeholder={fr ? "Autre…" : "Other…"}
            className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink"
          />
          <button type="button" onClick={addOther} className="rounded-md border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5">
            {fr ? "Ajouter" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
