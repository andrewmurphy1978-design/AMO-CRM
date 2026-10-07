"use client";

import DateInput from "@/components/date-input";
import { useState, useTransition } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import type { TaskDialogValues } from "@/actions/tasks";
import { generatePhasePrompt } from "@/actions/phase-prompts";
import BrandZipLink from "./brand-zip-link";
import { CARD_COLORS } from "@/components/section-card";

export type { TaskDialogValues };

// Same visual shell as PhaseDialog — used by the project-info page's "Add
// task" button so creating a task no longer needs the always-visible
// inline quick-add form.
export default function TaskDialog({
  open,
  onClose,
  initial,
  users,
  phases,
  onSave,
  lang,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  initial: TaskDialogValues;
  users: { id: string; name: string }[];
  phases: { id: string; name: string }[];
  onSave: (values: TaskDialogValues) => Promise<{ error?: string } | void>;
  lang: Lang;
  projectId?: string;
}) {
  const t = getDict(lang);
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState(initial.status);
  const [priority, setPriority] = useState(initial.priority);
  const [phaseId, setPhaseId] = useState(initial.phaseId);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial.assigneeIds ?? (initial.assigneeId ? [initial.assigneeId] : []));
  const [supervisorId, setSupervisorId] = useState(initial.supervisorId);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [completedDate, setCompletedDate] = useState(initial.completedDate ?? "");
  const [description, setDescription] = useState(initial.description);
  const [aiPrompt, setAiPrompt] = useState(initial.aiPrompt ?? "");
  const [assetsZip, setAssetsZip] = useState<{ url: string; count: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [guide, setGuide] = useState<{ busy: boolean; message?: string; error?: string; progress?: string }>({ busy: false });
  const [copied, setCopied] = useState(false);
  const fr = lang === "fr";
  // The Proposal phase's tasks have no AI prompt: the proposal builder already has its own AI draft.
  const inProposalPhase = /^(proposal|soumission|proposition)$/i.test(phases.find((p) => p.id === phaseId)?.name.trim() ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const STATUSES = [
    { value: "TODO", label: t.taskStatuses.TODO },
    { value: "IN_PROGRESS", label: t.taskStatuses.IN_PROGRESS },
    { value: "BLOCKED", label: t.taskStatuses.BLOCKED },
    { value: "DONE", label: t.taskStatuses.DONE },
  ] as const;

  const PRIORITIES = [
    { value: "LOW", label: t.priorities.LOW },
    { value: "MEDIUM", label: t.priorities.MEDIUM },
    { value: "HIGH", label: t.priorities.HIGH },
    { value: "URGENT", label: t.priorities.URGENT },
  ] as const;

  function save(override?: { status?: TaskDialogValues["status"] }) {
    startTransition(async () => {
      const result = await onSave({
        title,
        status: override?.status ?? status,
        priority,
        phaseId,
        assigneeId: assigneeIds[0] ?? "",
        assigneeIds,
        supervisorId,
        startDate,
        dueDate,
        completedDate,
        description,
        aiPrompt,
      });
      if (result?.error) setError(result.error);
      else onClose();
    });
  }

  const FIELD = "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
  const LABEL = "block text-xs font-semibold uppercase tracking-wide text-soft";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white ${CARD_COLORS.tasks}`}>
          <h3 className="truncate font-display text-lg font-semibold">{initial.title ? t.editTaskPage.title : t.taskDialog.addTitle}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !title.trim()}
              onClick={() => save()}
              className="rounded-md bg-amo-gold px-3 py-1 text-sm font-semibold text-[#152571] shadow-sm hover:brightness-95 disabled:opacity-60"
            >
              {pending ? t.common.saving : t.common.save}
            </button>
            <button type="button" onClick={onClose} aria-label={t.common.cancel} title={t.common.cancel} className="rounded-md px-2 py-0.5 text-lg leading-none hover:bg-white/20">
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Line 1: title (2 columns) and status */}
            <div className="sm:col-span-2">
              <label className={LABEL}>{t.taskForm.title}</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>{t.taskForm.status}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskDialogValues["status"])} className={FIELD}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Line 2: phase, priority, supervisor */}
            <div>
              <label className={LABEL}>{t.taskForm.phase}</label>
              <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className={FIELD}>
                <option value="">{t.taskForm.noPhase}</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>{t.taskForm.priority}</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskDialogValues["priority"])} className={FIELD}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>{t.taskForm.supervisor}</label>
              <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className={FIELD}>
                <option value="">{t.common.unassigned}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Line 3: assignees (several can be chosen) */}
            <div className="sm:col-span-3">
              <label className={LABEL}>{t.taskForm.assignee}</label>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-card-border bg-field-bg p-3">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-1.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(u.id)}
                      onChange={(e) => setAssigneeIds((prev) => (e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id)))}
                      className="h-4 w-4 rounded border-card-border accent-amo-lime"
                    />
                    {u.name}
                  </label>
                ))}
                {assigneeIds.length === 0 && <span className="text-xs text-soft">{t.common.unassigned}</span>}
              </div>
            </div>

            {/* Line 4: the three dates */}
            <div>
              <label className={LABEL}>{t.taskForm.startDate}</label>
              <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>{t.taskForm.dueDate}</label>
              <DateInput value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>{t.taskForm.completedDate}</label>
              <DateInput value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} className={FIELD} />
            </div>

            {/* Line 5: description */}
            <div className="sm:col-span-3">
              <label className={LABEL}>{t.taskForm.description}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={FIELD} />
            </div>
          </div>

        {!inProposalPhase && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{fr ? "Prompt généré pour l'IA" : "AI generated prompt for AI"}</label>
            <span className="flex items-center gap-3 text-xs">
              {projectId && phaseId && (
                <button
                  type="button"
                  disabled={generating}
                  onClick={async () => {
                    setGenerating(true);
                    const res = await generatePhasePrompt(projectId, phaseId);
                    setGenerating(false);
                    setAssetsZip(res.assetsZip ?? null);
                    if (res.prompt) setAiPrompt(res.prompt);
                    else setError(res.error ?? (fr ? "Aucun prompt disponible pour cette phase." : "No prompt is available for this phase."));
                  }}
                  className="font-semibold text-amo-lime hover:underline disabled:opacity-60"
                >
                  {generating ? (fr ? "Génération…" : "Generating…") : fr ? "Générer" : "Generate"}
                </button>
              )}
              {aiPrompt && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(aiPrompt);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      /* clipboard unavailable */
                    }
                  }}
                  className="font-semibold text-soft hover:underline"
                >
                  {copied ? (fr ? "Copié" : "Copied") : fr ? "Copier" : "Copy"}
                </button>
              )}
            </span>
          </div>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={4}
            placeholder={fr ? "Le prompt à copier-coller dans l'IA pour réaliser cette tâche…" : "The prompt to copy-paste into an AI to carry out this task…"}
            className="mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
          {assetsZip && <BrandZipLink url={assetsZip.url} count={assetsZip.count} fr={fr} />}
        </div>
        )}

        {/^(review the brand guides|réviser les guides de marque)/i.test(title) && (
          <div className="mt-3 rounded-lg border border-card-border bg-field-bg p-3">
            <button
              type="button"
              disabled={pending || status === "DONE"}
              onClick={() => {
                setStatus("DONE");
                save({ status: "DONE" });
              }}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {status === "DONE" ? (fr ? "✓ Guides approuvés" : "✓ Brand guides approved") : fr ? "✓ Approuver les guides de marque" : "✓ Approve the brand guides"}
            </button>
            <p className="mt-1 text-xs text-soft">{fr ? "À cliquer une fois les guides (EN et FR) révisés et approuvés : la tâche est terminée." : "Click once the guides (EN and FR) have been reviewed and approved: the task is completed."}</p>
          </div>
        )}

        {/\b(create the brand guide|créer le guide de marque)/i.test(title) && projectId && (
          <div className="mt-3 rounded-lg border border-card-border bg-field-bg p-3">
            <button
              type="button"
              disabled={guide.busy}
              onClick={async () => {
                setGuide({ busy: true, progress: fr ? "Vérification…" : "Checking…" });
                const call = async (payload: object) => {
                  const res = await fetch(`/api/projects/${projectId}/brand-guide`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
                  const text = await res.text();
                  try {
                    return JSON.parse(text) as { error?: string; parts?: number; content?: Record<string, unknown>; fileNames?: string[] };
                  } catch {
                    // Not our JSON: the web connection was cut (e.g. HTTP 524 after 100 s) or the server failed.
                    return { error: `${fr ? "Réponse inattendue du serveur" : "Unexpected server response"} (HTTP ${res.status}${text ? `: ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}` : ""})` };
                  }
                };
                const start = await call({ step: "start" }).catch((e: unknown) => ({ error: `${fr ? "Connexion interrompue" : "Connection interrupted"} (${e instanceof Error ? e.message : "network"})`, parts: undefined as number | undefined }));
                if (start.error || !start.parts) return setGuide({ busy: false, error: start.error ?? "Error" });
                // 4 parts x 2 languages, written in parallel (each is a short request); a failed part is tried once more.
                const total = start.parts * 2;
                let done = 0;
                const results: { en: Record<string, unknown>[]; fr: Record<string, unknown>[] } = { en: [], fr: [] };
                const run = async (lang: "en" | "fr", part: number) => {
                  for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                      const r = await call({ step: "part", lang, part });
                      if (r.content) {
                        results[lang][part] = r.content as Record<string, unknown>;
                        setGuide({ busy: true, progress: `${fr ? "Rédaction par l'IA" : "Writing with AI"} ${++done}/${total}` });
                        return null;
                      }
                      if (attempt === 1) return r.error ?? "Error";
                    } catch (e) {
                      if (attempt === 1) return `${fr ? "Connexion interrompue" : "Connection interrupted"} (${e instanceof Error ? e.message : "network"})`;
                    }
                  }
                  return "Error";
                };
                setGuide({ busy: true, progress: `${fr ? "Rédaction par l'IA" : "Writing with AI"} 0/${total}` });
                // Four at a time (all eight at once would load the server's memory eight times over).
                const queue = (["en", "fr"] as const).flatMap((lang) => Array.from({ length: start.parts! }, (_, p) => ({ lang, p })));
                const errors: (string | null)[] = [];
                await Promise.all(
                  Array.from({ length: 4 }, async () => {
                    for (let job = queue.shift(); job; job = queue.shift()) errors.push(await run(job.lang, job.p));
                  })
                );
                errors.splice(0, errors.length, ...errors.filter(Boolean));
                if (errors.length > 0) return setGuide({ busy: false, error: `${fr ? "L'IA n'a pas pu rédiger toutes les parties" : "The AI couldn't write every part"}: ${errors[0]}` });
                setGuide({ busy: true, progress: fr ? "Mise en page des PDF…" : "Laying out the PDFs…" });
                const res = await call({ step: "finish", guides: results }).catch((e: unknown) => ({ error: `${fr ? "Connexion interrompue" : "Connection interrupted"} (${e instanceof Error ? e.message : "network"})`, fileNames: undefined as string[] | undefined }));
                if (res.error) setGuide({ busy: false, error: res.error });
                else {
                  setGuide({ busy: false, message: fr ? `Guides PDF créés en anglais et en français (${(res.fileNames ?? []).join(", ")}) et ajoutés aux fichiers et à la carte Marque. La tâche est terminée.` : `English and French PDF guides created (${(res.fileNames ?? []).join(", ")}) and added to the Files and Brand cards. The task is completed.` });
                  setStatus("DONE");
                }
              }}
              className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60"
            >
              {guide.busy ? (guide.progress ?? (fr ? "Création…" : "Creating…")) : fr ? "📄 Créer les guides de marque PDF (EN + FR)" : "📄 Create the brand guide PDFs (EN + FR)"}
            </button>
            <p className="mt-1 text-xs text-soft">{fr ? "L'IA fusionne les rapports déposés sur la carte Marque et rédige un guide complet, en anglais et en français (environ 1 minute)." : "The AI merges the reports dropped on the Brand card into one complete guide, in English and in French (about a minute)."}</p>
            {guide.message && <p className="mt-1 text-xs text-emerald-700">{guide.message}</p>}
            {guide.error && <p className="mt-1 text-xs text-red-600">{guide.error}</p>}
          </div>
        )}

        {inProposalPhase && (
          <div className="mt-3 rounded-lg border border-card-border bg-field-bg p-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                // The Proposals card on the project page opens a new proposal and starts the AI draft.
                window.dispatchEvent(new CustomEvent("amo:new-proposal-ai"));
              }}
              className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm"
            >
              {fr ? "✨ Créer la soumission avec l'IA" : "✨ Create the proposal with AI"}
            </button>
            <p className="mt-1 text-xs text-soft">{fr ? "Ouvre une nouvelle soumission et lance la génération par l'IA." : "Opens a new proposal and starts the AI draft."}</p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        </div>
      </div>
    </div>
  );
}
