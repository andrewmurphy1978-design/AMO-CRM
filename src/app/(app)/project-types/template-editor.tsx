"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import ColorPicker from "@/components/color-picker";
import { isAppField } from "@/lib/project-subscriptions";
import { useRouter } from "next/navigation";
import { saveProjectTemplate, resetProjectTemplate, deleteProjectType } from "@/actions/project-types";
import { typeColor, PHASE_STAGES, isMulti, type PhaseStage, type Cond, type FieldTpl, type FieldType, type PhaseTpl, type TaskTpl, type TemplateConfig } from "@/lib/project-templates";

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

const STAGE_LABELS: Record<PhaseStage, string> = {
  PROPOSAL: "Proposal (until the 1st instalment)",
  PLANNING: "Planning (research, mock-up)",
  ACTIVE: "Active (building … deploying)",
  FINAL: "Final (awaiting the last instalment)",
};

const OPS: { value: Cond["op"]; label: string }[] = [
  { value: "yes", label: "is Yes" },
  { value: "no", label: "is No" },
  { value: "notEmpty", label: "is filled in" },
  { value: "equals", label: "equals" },
  { value: "includes", label: "includes" },
];

// Moves the item at `from` to position `to` (drag and drop).
function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  );
}

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

export default function TemplateEditor({ type, isUserType, initial, typeLabels, isCustom }: { type: string; typeKeys?: string[]; isUserType: boolean; initial: TemplateConfig; typeLabels: Record<string, string>; isCustom: boolean }) {
  const router = useRouter();
  const [config, setConfig] = useState<TemplateConfig>(initial);
  const [auto, setAuto] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // The header's action slot, filled in after mount (it lives outside this component).
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActionsSlot(document.getElementById("type-editor-actions"));
  }, []);
  // Drag and drop of field cards: the card is only draggable while its handle is held.
  // Phases whose tasks are folded away (by phase index).
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggleCollapsed = (pi: number) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(pi)) n.delete(pi);
      else n.add(pi);
      return n;
    });
  // Reorders phases and keeps the folded state attached to the right phases.
  function reorderPhases(from: number, to: number) {
    if (from === to) return;
    const idx = (i: number) => (i === from ? to : from < to && i > from && i <= to ? i - 1 : from > to && i >= to && i < from ? i + 1 : i);
    setCollapsed((c) => new Set([...c].map(idx)));
    setPhases(moveTo(phases, from, to));
  }
  // Ids look like "f3" (field), "p1" (phase) or "t1.2" (task 2 of phase 1).
  const [armed, setArmed] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

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

  function addSpacer() {
    let n = 1;
    while (fields.some((f) => f.key === `space_${n}`)) n++;
    setFields([...fields, { key: `space_${n}`, label: "Free space", type: "spacer" }]);
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

  function removeType() {
    if (!confirm(`Delete the project type "${typeLabels[type]}"? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteProjectType(type);
      if (res.error) return setMessage(res.error);
      router.push("/project-types");
      router.refresh();
    });
  }

  const multiFields = fields.filter(isMulti);

  const handle = (id: string) => (
    <span
      title="Drag to move"
      onMouseDown={() => setArmed(id)}
      onMouseUp={() => setArmed(null)}
      className="cursor-grab select-none text-sm leading-none text-soft hover:text-ink"
      aria-hidden
    >
      ⠿
    </span>
  );
  // Same-kind drops only; a task can only move within its own phase.
  function dropOn(from: string, to: string) {
    const kind = to[0];
    if (from[0] !== kind) return;
    if (kind === "f") setFields(moveTo(fields, Number(from.slice(1)), Number(to.slice(1))));
    else if (kind === "p") reorderPhases(Number(from.slice(1)), Number(to.slice(1)));
    else if (kind === "t") {
      const [fp, ft] = from.slice(1).split(".").map(Number);
      const [tp, tt] = to.slice(1).split(".").map(Number);
      if (fp === tp) setPhases(phases.map((ph, j) => (j === fp ? { ...ph, tasks: moveTo(ph.tasks, ft, tt) } : ph)));
    }
  }
  const dragProps = (id: string) => ({
    draggable: armed === id,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      setDragFrom(id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    },
    onDragOver: (e: React.DragEvent) => {
      if (dragFrom === null || dragFrom[0] !== id[0]) return;
      e.preventDefault();
      e.stopPropagation();
      if (dragOver !== id) setDragOver(id);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragFrom !== null) dropOn(dragFrom, id);
      setDragFrom(null);
      setDragOver(null);
      setArmed(null);
    },
    onDragEnd: () => {
      setDragFrom(null);
      setDragOver(null);
      setArmed(null);
    },
  });
  const dropClass = (id: string, idle: string) =>
    `${idle} ${dragOver === id && dragFrom !== id ? "ring-2 ring-emerald-600" : ""} ${dragFrom === id ? "opacity-50" : ""}`;

  return (
    <div className="space-y-6">
      {/* Save / Reset live in the page header (see the actions slot in project-types/page.tsx). */}
      {actionsSlot &&
        createPortal(
          <>
            {message && <span className="hidden text-sm text-amo-lime sm:inline">{message}</span>}
            {isCustom && (
              <button type="button" onClick={reset} disabled={pending} className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-amo-white hover:bg-white/10 disabled:opacity-60 sm:text-sm">
                Reset to default
              </button>
            )}
            <button type="button" onClick={save} disabled={pending} className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm disabled:opacity-60 sm:text-sm">
              {pending ? "Saving…" : "Save changes"}
            </button>
          </>,
          actionsSlot
        )}
      {isUserType && (
        <div>
          <button type="button" onClick={removeType} disabled={pending} className={`${SMALL_BTN} text-red-600`}>
            Delete this project type
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-xl border border-card-border bg-card-bg p-3 text-sm text-ink">
        <span className="font-semibold">Details card colour</span>
        <ColorPicker value={typeColor(type, config)} onChange={(hex) => setConfig((c) => ({ ...c, color: hex }))} label="Pick a colour" />
        <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: typeColor(type, config) }}>
          {typeLabels[type]} · Details
        </span>
        {config.color && (
          <button type="button" className={SMALL_BTN} onClick={() => setConfig((c) => ({ ...c, color: undefined }))}>
            Use the default
          </button>
        )}
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
            A new project only gets its first phase (Proposal) and that phase&apos;s tasks. The project then moves through its statuses: the proposal accepted + the 1st
            instalment paid → Planning (the contact becomes a Client); Planning finished (mock-up accepted) → Active (2nd instalment due); Deploying finished → Final; the
            last instalment paid → Completed. Within a status, each phase and its tasks are created only when the previous phase is completed. Each phase&apos;s &quot;Project status&quot;
            decides where it belongs. Untick to create every phase at once.
          </span>
        </span>
      </label>

      <section className="rounded-2xl border border-card-border bg-card-bg p-4 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-ink">Custom fields</h2>
        <p className="mt-1 text-xs text-soft">Asked when a {typeLabels[type]} project is created. Use a field&apos;s name in task titles as {"{field_name}"} (shown under each field).</p>
        <div className="mt-3 grid items-start gap-3 lg:grid-cols-3">
          {fields.map((f, i) =>
            f.type === "spacer" ? (
              <div key={i} {...dragProps(`f${i}`)} className={dropClass(`f${i}`, "flex min-w-0 items-center justify-between gap-2 rounded-xl border border-dashed border-card-border p-3")}>
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-soft">
                  {handle(`f${i}`)}Free space (empty cell)
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" className={SMALL_BTN} onClick={() => setFields(move(fields, i, -1))} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" className={SMALL_BTN} onClick={() => setFields(move(fields, i, 1))} disabled={i === fields.length - 1}>
                    ↓
                  </button>
                  <button type="button" title="Delete" aria-label="Delete" className={`${SMALL_BTN} text-red-600`} onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ) : (
            <div key={i} {...dragProps(`f${i}`)} className={dropClass(`f${i}`, "min-w-0 rounded-xl border border-card-border p-3")}>
              <div className="grid gap-2">
                <div>
                  <label className={`${LABEL} flex items-center gap-2`}>
                    {handle(`f${i}`)}Label
                  </label>
                  <input value={f.label} onChange={(e) => relabel(i, e.target.value)} className={INPUT} />
                </div>
                <div className="flex items-end gap-1">
                  <div className="min-w-0 flex-1">
                    <label className={LABEL}>Type</label>
                    <select value={f.type} onChange={(e) => updateField(i, { type: e.target.value as FieldType })} className={INPUT}>
                      {FIELD_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className={`${SMALL_BTN} py-2`} onClick={() => setFields(move(fields, i, -1))} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" className={`${SMALL_BTN} py-2`} onClick={() => setFields(move(fields, i, 1))} disabled={i === fields.length - 1}>
                    ↓
                  </button>
                  <button type="button" title="Delete" aria-label="Delete" className={`${SMALL_BTN} py-2 text-red-600`} onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                    <TrashIcon />
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
              {(f.type === "select" || f.type === "multiselect" || f.type === "text") && (
                <label className="mt-1 flex items-center gap-2 text-xs text-ink">
                  <input type="checkbox" checked={isAppField(f)} onChange={(e) => updateField(i, { app: e.target.checked })} />
                  The answer is an app / service (adds it to Apps &amp; subscriptions)
                </label>
              )}
              <div className="mt-2">
                <CondEditor
                  label="Only ask when"
                  cond={f.showIf}
                  onChange={(c) => updateField(i, { showIf: c })}
                  fields={fields.filter((x) => x.key !== f.key)}
                />
                {f.showIf && (
                  <label className="mt-1 flex items-center gap-2 text-xs text-ink">
                    <input type="checkbox" checked={Boolean(f.keepSpace)} onChange={(e) => updateField(i, { keepSpace: e.target.checked || undefined })} />
                    Keep its space empty while hidden (other fields don&apos;t move up)
                  </label>
                )}
              </div>
            </div>
            )
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={addField} className={SMALL_BTN}>
            + Add field
          </button>
          <button type="button" onClick={addSpacer} className={SMALL_BTN}>
            + Add free space
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-card-border bg-card-bg p-4 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-ink">Phases &amp; tasks created with a new project</h2>
        <p className="mt-1 text-xs text-soft">
          A task can be repeated for every selected value of one or more multi-choice fields (e.g. each language × each page); use {"{field_name}"} in its title.
        </p>
        {phases.length > 0 && (
          <button
            type="button"
            className={`${SMALL_BTN} mt-2`}
            onClick={() => setCollapsed(collapsed.size >= phases.length ? new Set() : new Set(phases.map((_, i) => i)))}
          >
            {collapsed.size >= phases.length ? "▸ Show all tasks" : "▾ Hide all tasks (phases only)"}
          </button>
        )}
        <div className="mt-3 space-y-4">
          {phases.map((p, pi) => (
            <div key={pi} {...dragProps(`p${pi}`)} className={dropClass(`p${pi}`, "rounded-xl border border-card-border p-3")}>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <label className={`${LABEL} flex items-center gap-2`}>
                    {handle(`p${pi}`)}Phase {pi + 1}
                  </label>
                  <input value={p.name} onChange={(e) => updatePhase(pi, { name: e.target.value })} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Project status</label>
                  <select value={p.stage ?? "ACTIVE"} onChange={(e) => updatePhase(pi, { stage: e.target.value as PhaseStage })} className={INPUT}>
                    {PHASE_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {STAGE_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  title={collapsed.has(pi) ? "Show tasks" : "Hide tasks"}
                  aria-label={collapsed.has(pi) ? "Show tasks" : "Hide tasks"}
                  aria-expanded={!collapsed.has(pi)}
                  className={`${SMALL_BTN} py-2`}
                  onClick={() => toggleCollapsed(pi)}
                >
                  {collapsed.has(pi) ? "▸" : "▾"} {p.tasks.length}
                </button>
                <button type="button" className={SMALL_BTN} onClick={() => reorderPhases(pi, pi - 1)} disabled={pi === 0}>
                  ↑
                </button>
                <button type="button" className={SMALL_BTN} onClick={() => reorderPhases(pi, pi + 1)} disabled={pi === phases.length - 1}>
                  ↓
                </button>
                <button type="button" title="Delete phase" aria-label="Delete phase" className={`${SMALL_BTN} py-2 text-red-600`} onClick={() => {
                    setCollapsed((c) => new Set([...c].filter((i) => i !== pi).map((i) => (i > pi ? i - 1 : i))));
                    setPhases(phases.filter((_, j) => j !== pi));
                  }}>
                  <TrashIcon />
                </button>
              </div>
              <div className="mt-2">
                <CondEditor label="Create when" cond={p.when} onChange={(c) => updatePhase(pi, { when: c })} fields={fields} />
              </div>
              {!collapsed.has(pi) && (
              <>
              <ul className="mt-3 space-y-2 border-l-2 border-card-border pl-3">
                {p.tasks.map((tk, ti) => (
                  <li key={ti} {...dragProps(`t${pi}.${ti}`)} className={dropClass(`t${pi}.${ti}`, "space-y-1.5 rounded-lg bg-black/[0.03] p-2")}>
                    <div className="flex items-center gap-1.5">
                      {handle(`t${pi}.${ti}`)}
                      <input value={tk.title} onChange={(e) => updateTask(pi, ti, { title: e.target.value })} className={INPUT} placeholder="Task title" />
                      <button type="button" className={SMALL_BTN} onClick={() => updatePhase(pi, { tasks: move(p.tasks, ti, -1) })} disabled={ti === 0}>
                        ↑
                      </button>
                      <button type="button" className={SMALL_BTN} onClick={() => updatePhase(pi, { tasks: move(p.tasks, ti, 1) })} disabled={ti === p.tasks.length - 1}>
                        ↓
                      </button>
                      <button type="button" title="Delete task" aria-label="Delete task" className={`${SMALL_BTN} py-2 text-red-600`} onClick={() => updatePhase(pi, { tasks: p.tasks.filter((_, j) => j !== ti) })}>
                        <TrashIcon />
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
              </>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setPhases([...phases, { name: "New phase", tasks: [] }])} className={SMALL_BTN}>
            + Add phase
          </button>
        </div>
      </section>
    </div>
  );
}
