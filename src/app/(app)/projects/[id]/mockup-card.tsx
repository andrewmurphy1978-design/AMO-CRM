"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/section-card";
import { useFileDrop, DROP_RING } from "@/components/use-file-drop";
import { deleteAttachedFile } from "@/actions/attached-files";
import type { FileRow } from "@/components/files-card";

// The Mock-ups card: drop what the AI made (mockup-report.md and the mockup-assets.zip of PNG images). The CRM
// ticks the "Build the … mock-up" tasks the files cover and shows the images by mock-up.
export default function MockupCard({ projectId, reports, shots, lang }: { projectId: string; reports: FileRow[]; shots: { id: string; name: string }[]; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState("");
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
      form.set("kind", "MOCKUP_REPORT");
      try {
        const res = await fetch("/api/files", { method: "POST", body: form });
        if (!res.ok) {
          problems.push(`${f.name}: ${fr ? "échec du téléversement" : "upload failed"}`);
          continue;
        }
        const json = (await res.json()) as { problems?: string[]; brandNote?: string; zip?: { added: number; skipped: string[] } | null; mockup?: { sections: string[]; verified: string[] } | null };
        problems.push(...(json.problems ?? []));
        if (json.brandNote) notes.push(json.brandNote);
        if (json.mockup?.sections.length) notes.push(`${fr ? "Maquettes trouvées dans le rapport" : "Mock-ups found in the report"}: ${json.mockup.sections.join(", ")}.`);
        if (json.mockup?.verified.length) notes.push(`${fr ? "Terminé" : "Completed"}: ${json.mockup.verified.join(", ")}.`);
        if (json.zip) {
          notes.push(fr ? `${json.zip.added} image(s) ajoutée(s).` : `${json.zip.added} image(s) added.`);
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

  // Images grouped by mock-up ("website/home-desktop.png" -> Website).
  const groups = new Map<string, { id: string; name: string }[]>();
  for (const s of shots) {
    const i = s.name.indexOf("/");
    const key = i > 0 ? s.name.slice(0, i) : "";
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  return (
    <Card color="phases" title={<>{fr ? "Maquettes" : "Mock-ups"}{reports.length + shots.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{reports.length + shots.length}</span>}</>} compact>
      <div {...drop.bind} className={`rounded-lg border-2 border-dashed border-card-border p-3 text-center text-xs text-soft ${drop.dragging ? DROP_RING : ""}`}>
        {busy ? (
          fr ? "Téléversement…" : "Uploading…"
        ) : (
          <>
            {fr ? "Glissez-déposez ici le rapport des maquettes (.md) et le zip d'images (.zip), ou " : "Drag and drop the mock-up report (.md) and the images zip (.zip) here, or "}
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
      {[...groups.entries()].map(([key, list]) => (
        <div key={key}>
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">
            {key ? key : fr ? "Images" : "Images"} ({list.length})
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {list.slice(0, 12).map((s) => (
              <a key={s.id} href={`/api/files/${s.id}`} target="_blank" rel="noreferrer" title={s.name}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by /api/files */}
                <img src={`/api/files/${s.id}`} alt={s.name} loading="lazy" className="h-14 w-20 rounded border border-card-border bg-black/5 object-cover" />
              </a>
            ))}
            {list.length > 12 && <span className="self-center text-xs text-soft">+{list.length - 12}</span>}
          </div>
        </div>
      ))}
    </Card>
  );
}
