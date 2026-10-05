"use client";

// The brand files as a .zip, to drag and drop into an AI chat next to the prompt (Chrome / Edge let
// you drag this chip straight into the chat; everywhere else it is a normal download link).
export default function BrandZipLink({ url, count, fr }: { url: string; count: number; fr: boolean }) {
  return (
    <a
      href={url}
      download
      draggable
      onDragStart={(e) => {
        const abs = new URL(url, window.location.origin).toString();
        e.dataTransfer.setData("DownloadURL", `application/zip:brand-assets.zip:${abs}`);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className="mt-2 inline-flex items-center gap-2 rounded-md border border-dashed border-card-border bg-field-bg px-3 py-1.5 text-xs font-semibold text-ink hover:bg-black/5"
      title={fr ? "Glissez-déposez ce fichier dans l'IA avec le prompt" : "Drag and drop this file into the AI together with the prompt"}
    >
      📦 brand-assets.zip ({count} {fr ? (count > 1 ? "fichiers" : "fichier") : count > 1 ? "files" : "file"})
      <span className="font-normal text-soft">{fr ? "— glisser-déposer dans l'IA avec le prompt" : "— drag and drop into the AI with the prompt"}</span>
    </a>
  );
}
