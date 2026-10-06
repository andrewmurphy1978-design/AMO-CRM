"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFileDrop, DROP_RING } from "@/components/use-file-drop";
import { deleteAttachedFile } from "@/actions/attached-files";
import type { FileRow } from "@/components/files-card";

// The Brand card's "AI report" drop zone: drop the report the AI wrote for the brand (a PDF, Markdown,
// Word or zip file...) and it is kept with the client's files.
export default function BrandReportDrop({ contactId, reports, fr }: { contactId: string; reports: FileRow[]; fr: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const [pending, startTransition] = useTransition();

  async function upload(list: FileList | File[]) {
    setBusy(true);
    setMessage(null);
    const problems: string[] = [];
    const notes: string[] = [];
    for (const f of [...list]) {
      if (f.size > 10_000_000) {
        problems.push(`${f.name}: ${fr ? "plus de 10 Mo" : "over 10 MB"}`);
        continue;
      }
      const form = new FormData();
      form.set("file", f);
      form.set("contactId", contactId);
      form.set("kind", "BRAND_REPORT");
      try {
        const res = await fetch("/api/files", { method: "POST", body: form });
        if (!res.ok) problems.push(`${f.name}: ${fr ? "échec du téléversement" : "upload failed"}`);
        else {
          const json = (await res.json()) as { problems?: string[]; brandNote?: string; brand?: { added: number; verified: string[]; missing: string[] } | null; zip?: { added: number; skipped: string[] } | null };
          problems.push(...(json.problems ?? []));
          if (json.brandNote) notes.push(json.brandNote);
          if (json.brand) {
            if (json.brand.added > 0) notes.push(fr ? `${json.brand.added} élément(s) ajouté(s) à la carte Marque.` : `${json.brand.added} item(s) added to the Brand card.`);
            if (json.brand.verified.length > 0) notes.push(`${fr ? "Vérifié et terminé" : "Verified and completed"}: ${json.brand.verified.join(", ")}.`);
            if (json.brand.missing.length > 0) notes.push(`${fr ? "Non terminé" : "Not completed"}: ${json.brand.missing.join("; ")}.`);
          }
          if (json.zip) {
            notes.push(fr ? `${json.zip.added} image(s) du zip ajoutée(s) à la carte Marque.` : `${json.zip.added} image(s) from the zip added to the Brand card.`);
            if (json.zip.skipped.length > 0) notes.push(`${fr ? "Ignoré" : "Skipped"}: ${json.zip.skipped.slice(0, 6).join(", ")}${json.zip.skipped.length > 6 ? "…" : ""}.`);
          }
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

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-soft">{fr ? "Rapport de l'IA" : "AI report"}</p>
      <div {...drop.bind} className={`mt-1.5 rounded-lg border-2 border-dashed border-card-border p-3 text-center text-xs text-soft ${drop.dragging ? DROP_RING : ""}`}>
        {busy ? (
          fr ? "Téléversement…" : "Uploading…"
        ) : (
          <>
            {fr ? "Glissez-déposez ici les fichiers de l'IA : le rapport (.md) et le zip d'images, ou " : "Drag and drop the AI's files here: the report (.md) and the images zip, or "}
            <button type="button" onClick={() => input.current?.click()} className="font-semibold text-emerald-700 hover:underline">
              {fr ? "choisissez un fichier" : "choose a file"}
            </button>
          </>
        )}
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
      </div>
      {message && <p className="mt-1 text-xs text-red-600">{message}</p>}
      {info && <p className="mt-1 text-xs text-emerald-700">{info}</p>}
      {reports.length > 0 && (
        <ul className="mt-2 space-y-1">
          {reports.map((r) => (
            <li key={r.id} className="flex items-center gap-3 text-sm">
              <span>📄</span>
              <a href={`/api/files/${r.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-emerald-700 hover:underline" title={r.name}>
                {r.name}
              </a>
              <span className="shrink-0 text-xs text-soft">{new Date(r.createdAt).toLocaleDateString(fr ? "fr-CA" : "en-CA")}</span>
              <a href={`/api/files/${r.id}?download=1`} className="shrink-0 text-xs text-soft hover:underline">
                {fr ? "Télécharger" : "Download"}
              </a>
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
    </div>
  );
}
