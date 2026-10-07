"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/section-card";
import { useFileDrop, DROP_RING } from "@/components/use-file-drop";
import { deleteAttachedFile } from "@/actions/attached-files";
import { runStepwiseReport } from "@/lib/stepwise-client";
import type { FileRow } from "@/components/files-card";

// The Research card: drop the reports the AIs produced (a Markdown report and, if they could, a zip of
// screenshots) one after the other; the CRM checks each one and ticks the research tasks it covers. When
// all are in, one button merges them into the final report, written in English and in French (two PDFs).
export default function ResearchCard({ projectId, reports, shots, pdfs, lang }: { projectId: string; reports: FileRow[]; shots: { id: string; name: string }[]; pdfs: FileRow[]; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const [gen, setGen] = useState<{ busy: boolean; progress?: string; error?: string; done?: string }>({ busy: false });
  const [pending, startTransition] = useTransition();

  async function upload(list: FileList | File[]) {
    setBusy(true);
    const problems: string[] = [];
    const notes: string[] = [];
    for (const f of [...list]) {
      if (f.size > 10_000_000) {
        problems.push(`${f.name}: ${fr ? "plus de 10 Mo" : "over 10 MB"}`);
        continue;
      }
      const form = new FormData();
      form.set("file", f);
      form.set("projectId", projectId);
      form.set("kind", "RESEARCH_REPORT");
      try {
        const res = await fetch("/api/files", { method: "POST", body: form });
        if (!res.ok) {
          problems.push(`${f.name}: ${fr ? "échec du téléversement" : "upload failed"}`);
          continue;
        }
        const json = (await res.json()) as { problems?: string[]; brandNote?: string; zip?: { added: number; skipped: string[] } | null; research?: { competitors: number; verified: string[]; missing: string[] } | null };
        problems.push(...(json.problems ?? []));
        if (json.brandNote) notes.push(json.brandNote);
        if (json.research) {
          notes.push(fr ? `${json.research.competitors} concurrent(s) trouvé(s) dans le rapport.` : `${json.research.competitors} competitor(s) found in the report.`);
          if (json.research.verified.length > 0) notes.push(`${fr ? "Vérifié et terminé" : "Verified and completed"}: ${json.research.verified.join(", ")}.`);
          if (json.research.missing.length > 0) notes.push(`${fr ? "Non terminé" : "Not completed"}: ${json.research.missing.join("; ")}.`);
        }
        if (json.zip) {
          notes.push(fr ? `${json.zip.added} capture(s) d'écran ajoutée(s).` : `${json.zip.added} screenshot(s) added.`);
          if (json.zip.skipped.length > 0) notes.push(`${fr ? "Ignoré" : "Skipped"}: ${json.zip.skipped.slice(0, 5).join(", ")}${json.zip.skipped.length > 5 ? "…" : ""}.`);
        }
      } catch {
        problems.push(`${f.name}: ${fr ? "échec du téléversement" : "upload failed"}`);
      }
    }
    setBusy(false);
    setMessage(problems.length > 0 ? problems.join(" · ") : null);
    setInfo(notes.join(" "));
    if (input.current) input.current.value = "";
    router.refresh();
  }
  const drop = useFileDrop((files) => void upload(files), busy);
  const mdReports = reports.filter((r) => /\.(md|markdown|txt)$/i.test(r.name));

  async function createReport() {
    setGen({ busy: true });
    const res = await runStepwiseReport(`/api/projects/${projectId}/research-report`, fr, (progress) => setGen({ busy: true, progress }), "parts");
    if (res.error) setGen({ busy: false, error: res.error });
    else {
      setGen({ busy: false, done: fr ? `Rapports créés : ${(res.fileNames ?? []).join(", ")}. La tâche « Produire le rapport » est terminée.` : `Reports created: ${(res.fileNames ?? []).join(", ")}. The "Produce report" task is completed.` });
      router.refresh();
    }
  }

  return (
    <Card color="phases" title={<>{fr ? "Recherche" : "Research"}{reports.length + shots.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{reports.length}</span>}</>} compact>
      <div {...drop.bind} className={`rounded-lg border-2 border-dashed border-card-border p-3 text-center text-xs text-soft ${drop.dragging ? DROP_RING : ""}`}>
        {busy ? (
          fr ? "Téléversement…" : "Uploading…"
        ) : (
          <>
            {fr ? "Glissez-déposez ici les rapports de recherche des IA (.md) et le zip de captures d'écran, ou " : "Drag and drop the AIs' research reports (.md) and the screenshots zip here, or "}
            <button type="button" onClick={() => input.current?.click()} className="font-semibold text-emerald-700 hover:underline">
              {fr ? "choisissez des fichiers" : "choose files"}
            </button>
          </>
        )}
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
      </div>
      {message && <p className="text-xs text-red-600">{message}</p>}
      {info && <p className="text-xs text-emerald-700">{info}</p>}

      {reports.length > 0 && (
        <ul className="space-y-1">
          {reports.map((r) => (
            <li key={r.id} className="flex items-center gap-3 text-sm">
              <span>📄</span>
              <a href={`/api/files/${r.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-emerald-700 hover:underline" title={r.name}>
                {r.name}
              </a>
              <span className="shrink-0 text-xs text-soft">{new Date(r.createdAt).toLocaleDateString(fr ? "fr-CA" : "en-CA")}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(fr ? `Supprimer « ${r.name} » ?` : `Delete “${r.name}”?`)) return;
                  startTransition(async () => {
                    await deleteAttachedFile(r.id);
                    router.refresh();
                  });
                }}
                className="shrink-0 text-xs text-red-600 hover:underline"
              >
                {fr ? "Supprimer" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {shots.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">{fr ? `Captures d'écran (${shots.length})` : `Screenshots (${shots.length})`}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {shots.slice(0, 12).map((s) => (
              <a key={s.id} href={`/api/files/${s.id}`} target="_blank" rel="noreferrer" title={s.name}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by /api/files */}
                <img src={`/api/files/${s.id}`} alt={s.name} loading="lazy" className="h-14 w-20 rounded border border-card-border bg-black/5 object-cover" />
              </a>
            ))}
            {shots.length > 12 && <span className="self-center text-xs text-soft">+{shots.length - 12}</span>}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-card-border bg-field-bg p-3">
        <button type="button" disabled={gen.busy || mdReports.length === 0} onClick={() => void createReport()} className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60">
          {gen.busy ? (gen.progress ?? "…") : fr ? "📄 Créer le rapport final (EN + FR)" : "📄 Create the final report (EN + FR)"}
        </button>
        <p className="mt-1 text-xs text-soft">
          {mdReports.length === 0
            ? fr ? "Déposez au moins un rapport (.md) pour pouvoir créer le rapport final." : "Drop at least one report (.md) to create the final report."
            : fr ? `L'IA fusionne les ${mdReports.length} rapport(s) en un seul, en anglais et en français (environ 1 minute).` : `The AI merges the ${mdReports.length} report(s) into one, in English and in French (about a minute).`}
        </p>
        {gen.done && <p className="mt-1 text-xs text-emerald-700">{gen.done}</p>}
        {gen.error && <p className="mt-1 text-xs text-red-600">{gen.error}</p>}
        {pdfs.map((p) => (
          <p key={p.id} className="mt-1 text-sm">
            📕{" "}
            <a href={`/api/files/${p.id}`} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 hover:underline">
              {p.name}
            </a>
          </p>
        ))}
      </div>
    </Card>
  );
}
