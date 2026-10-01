"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProjectTemplate, resetProjectTemplate } from "@/actions/project-types";
import { TEMPLATE_TYPES, isMulti, type Cond, type FieldTpl, type FieldType, type PhaseTpl, type TaskTpl, type TemplateConfig } from "@/lib/project-templates";

const INPUT = "w-full min-w-0 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wide text-soft";
const SMALL_BTN = "rounded-md border border-card-border px-2 py-1 text-xs font-medium text-ink hover:bg-black/5 disabled:opacity-40";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "yesno", label: "Yes / No" },
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "url", label: "Link / file URL" },
  { value: "select", label: "Choose one" },
  { value: "multiselect", label: "Choose several" },
  { value: "languages", label: "Languages" },
];

const OPS: { value: Cond["op"]; label: string }[] = [
  { value: "yes", label: "is Yes" },
  { value: "no", label: "is No" },
  { value: "notEmpty", label: "is filled in" },
  { value: "equals", label: "equals" },
  { value: "includes", label: "includes" },
];

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
}

function CondEditor({ cond, onChange, fields, label }: { cond?: Cond; onChange: (c: Cond | undefined) => void; fields: FieldTpl[]; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={LABEL}>{label}</span>
      <select
        value={cond?.field ?? ""}
        onChange={(e) => onChange(e.target.value ? { field: e.target.value, op: cond?.op ?? "yes", value: cond?.value } : undefined)}
        className={`${INPUT} !w-auto`}
      >
        <option value="">always</option>
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      {cond && (
        <>
          <select value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as Cond["op"] })} className={`${INPUT} !w-auto`}>
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {(cond.op === "equals" || cond.op === "includes") && (
            <input value={cond.value ?? ""} onChange={(e) => onChange({ ...cond, value: e.target.value })} className={`${INPUT} !w-40`} placeholder="value" />
          )}
        </>
      )}
    </div>
  );
}

export default function TemplateEditor({ type, initial, typeLabels, isCustom }: { type: string; initial: TemplateConfig; typeLabels: Record<string, string>; isCustom: boolean }) {
  const router = useRouter();
  const [config, setConfig] = useState<TemplateConfig>(initial);
  const [auto, setAuto] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const { fields, phases } = config;
  const setFields = (f: FieldTpl[]) => setConfig((c) => ({ ...c, fields: f }));
  const setPhases = (p: PhaseTpl[]) => setConfig((c) => ({ ...c, phases: p }));

  function renameKey(oldKey: string, newKey: string, next: TemplateConfig): TemplateConfig {
    const fixCond = (c?: Cond) => (c && c.field === oldKey ? { ...c, field: newKey } : c);
    return {
      fields: next.fields.map((f) => ({ ...f, showIf: fixCond(f.showIf) })),
      phases: next.phases.map((p) => ({
        ...p,
        when: fixCond(p.when),
        tasks: p.tasks.map((tk) => ({
          ...tk,
          when: fixCond(tk.when),
          repeat: tk.repeat?.map((k) => (k === oldKey ? newKey : k)),
          title: tk.title.split(`{${oldKey}}`).join(`{${newKey}}`),
        })),
      })),
    };
  }

  function relabel(i: number, label: string) {
    const f = fields[i];
    let next: TemplateConfig = { ...config, fields: fields.map((x, j) => (j === i ? { ...x, label } : x)) };
    if (auto.has(f.key)) {
      let key = slug(label);
      while (fields.some((x, j) => j !== i && x.key === key)) key += "_2";
      if (key !== f.key) {
        next = renameKey(f.key, key, { ...next, fields: next.fields.map((x, j) => (j === i ? { ...x, key } : x)) });
        setAuto((a) => new Set([...a].filter((k) => k !== f.key).concat(key)));
      }
    }
    setConfig(next);
  }

  function addField() {
    let key = "new_field";
    while (fields.some((f) => f.key === key)) key += "_2";
    setAuto((a) => new Set(a).add(key));
    setFields([...fields, { key, label: "New field", type: "yesno" }]);
  }

  function updateField(i: number, patch: Partial<FieldTpl>) {
    setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }

  function updatePhase(i: number, patch: Partial<PhaseTpl>) {
    setPhases(phases.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function updateTask(pi: number, ti: number, patch: Partial<TaskTpl>) {
    updatePhase(pi, { tasks: phases[pi].tasks.map((tk, j) => (j === ti ? { ...tk, ...patch } : tk)) });
  }

  function save() {
    startTransition(async () => {
      await saveProjectTemplate(type, config);
      setMessage("Saved.");
      router.refresh();
    });
  }
  function reset() {
    if (!confirm("Reset this project type to the built-in default? Your changes to it will be lost.")) return;
    startTransition(async () => {
      await resetProjectTemplate(type);
      setMessage("Reset to default.");
      router.refresh();
      window.location.reload();
    });
  }

  const multiFields = fields.filter(isMulti);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60">
          {pending ? "Saving…" : "Save changes"}
        </button>
        {isCustom && (
          <button type="button" onClick={reset} disabled={pending} className={SMALL_BTN}>
            Reset to default
          </button>
        )}
        {message && <span className="text-sm text-emerald-700">{message}</span>}
      </div>

      <label className="flex items-start gap-2 rounded-xl border border-card-border bg-card-bg p-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={config.progressive !== false}
          onChange={(e) => setConfig((c) => ({ ...c, progressive: e.target.checked ? undefined : false }))}
        />
        <span>
          <span className="font-semibold">Create phases one at a time</span>
          <span className="block text-xs text-soft">
            A new project only gets its first phase (normally Planning) and that phase&apos;s tasks. When a phase is completed — all its tasks done, or the phase marked Completed
            — the next phase and its tasks are added. For the Planning phase, accepting the proposal completes it. Untick to create every phase at once.
          </span>
        </span>
      </label>

      <section className="rounded-2xl border border-card-border bg-card-bg p-4 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-ink">Custom fields</h2>
        <p className="mt-1 text-xs text-soft">Asked when a {typeLabels[type]} project is created. Use a field&apos;s name in task titles as {"{field_name}"} (shown under each field).</p>
        <div className="mt-3 space-y-3">
          {fields.map((f, i) => (
            <div key={f.key + i} className="rounded-xl border border-card-border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                <div>
                  <label className={LABEL}>Label</label>
                  <input value={f.label} onChange={(e) => relabel(i, e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Type</label>
                  <select value={f.type} onChange={(e) => updateField(i, { type: e.target.value as FieldType })} className={INPUT}>
                    {FIELD_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end gap-1">
                  <button type="button" className={SMALL_BTN} onClick={() => setFields(move(fields, i, -1))} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" className={SMALL_BTN} onClick={() => setFields(move(fields, i, 1))} disabled={i === fields.length - 1}>
                    ↓
                  </button>
                  <button type="button" className={`${SMALL_BTN} text-red-600`} onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-soft">
                Name for task titles: <code>{`{${f.key}}`}</code>
              </p>
              {(f.type === "select" || f.type === "multiselect" || f.type === "languages") && (
                <div className="mt-2">
                  <label className={LABEL}>Choices (one per line){f.type === "languages" ? " — leave empty for the standard language list" : ""}</label>
                  <textarea
                    rows={3}
                    value={(f.options ?? []).join("\n")}
                    onChange={(e) => updateField(i, { options: e.target.value.split("\n") })}
                    className={INPUT}
                  />
                  <label className="mt-1 flex items-center gap-2 text-xs text-ink">
                    <input type="checkbox" checked={Boolean(f.allowOther)} onChange={(e) => updateField(i, { allowOther: e.target.checked })} />
                    Allow typing other choices
                  </label>
                </div>
              )}
              {f.type === "yesno" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={LABEL}>If Yes, also create a project of type</span>
                  <select value={f.spawnType ?? ""} onChange={(e) => updateField(i, { spawnType: e.target.value || undefined })} className={`${INPUT} !w-auto`}>
                    <option value="">— none —</option>
                    {TEMPLATE_TYPES.map((tp) => (
                      <option key={tp} value={tp}>
                        {typeLabels[tp]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="mt-2">
                <CondEditor
                  label="Only ask when"
                  cond={f.showIf}
                  onChange={(c) => updateField(i, { showIf: c })}
                  fields={fields.filter((x) => x.key !== f.key)}
                />
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addField} className={`${SMALL_BTN} mt-3`}>
          + Add field
        </button>
      </section>

      <section className="rounded-2xl border border-card-border bg-card-bg p-4 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-ink">Phases &amp; tasks created with a new project</h2>
        <p className="mt-1 text-xs text-soft">
          A task can be repeated for every selected value of one or more multi-choice fields (e.g. each language × each page); use {"{field_name}"} in its title.
        </p>
        <div className="mt-3 space-y-4">
          {phases.map((p, pi) => (
            <div key={pi} className="rounded-xl border border-card-border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <label className={LABEL}>Phase {pi + 1}</label>
                  <input value={p.name} onChange={(e) => updatePhase(pi, { name: e.target.value })} className={INPUT} />
                </div>
                <button type="button" className={SMALL_BTN} onClick={() => setPhases(move(phases, pi, -1))} disabled={pi === 0}>
                  ↑
                </button>
                <button type="button" className={SMALL_BTN} onClick={() => setPhases(move(phases, pi, 1))} disabled={pi === phases.length - 1}>
                  ↓
                </button>
                <button type="button" className={`${SMALL_BTN} text-red-600`} onClick={() => setPhases(phases.filter((_, j) => j !== pi))}>
                  Delete phase
                </button>
              </div>
              <div className="mt-2">
                <CondEditor label="Create when" cond={p.when} onChange={(c) => updatePhase(pi, { when: c })} fields={fields} />
              </div>
              <ul className="mt-3 space-y-2 border-l-2 border-card-border pl-3">
                {p.tasks.map((tk, ti) => (
                  <li key={ti} className="space-y-1.5 rounded-lg bg-black/[0.03] p-2">
                    <div className="flex items-center gap-1.5">
                      <input value={tk.title} onChange={(e) => updateTask(pi, ti, { title: e.target.value })} className={INPUT} placeholder="Task title" />
                      <button type="button" className={SMALL_BTN} onClick={() => updatePhase(pi, { tasks: move(p.tasks, ti, -1) })} disabled={ti === 0}>
                        ↑
                      </button>
                      <button type="button" className={SMALL_BTN} onClick={() => updatePhase(pi, { tasks: move(p.tasks, ti, 1) })} disabled={ti === p.tasks.length - 1}>
                        ↓
                      </button>
                      <button type="button" className={`${SMALL_BTN} text-red-600`} onClick={() => updatePhase(pi, { tasks: p.tasks.filter((_, j) => j !== ti) })}>
                        ✕
                      </button>
                    </div>
                    <CondEditor label="Create when" cond={tk.when} onChange={(c) => updateTask(pi, ti, { when: c })} fields={fields} />
                    {multiFields.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={LABEL}>Repeat for each</span>
                        {multiFields.map((mf) => (
                          <label key={mf.key} className="flex items-center gap-1 text-xs text-ink">
                            <input
                              type="checkbox"
                              checked={tk.repeat?.includes(mf.key) ?? false}
                              onChange={(e) => {
                                const cur = tk.repeat ?? [];
                                updateTask(pi, ti, { repeat: e.target.checked ? [...cur, mf.key] : cur.filter((k) => k !== mf.key) });
                              }}
                            />
                            {mf.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <button type="button" className={`${SMALL_BTN} mt-2`} onClick={() => updatePhase(pi, { tasks: [...p.tasks, { title: "" }] })}>
                + Add task
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setPhases([...phases, { name: "New phase", tasks: [] }])} className={`${SMALL_BTN} mt-3`}>
          + Add phase
        </button>
      </section>
    </div>
  );
}
