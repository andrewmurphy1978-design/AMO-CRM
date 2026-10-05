import { isDataUri } from "@/lib/brand";

// The files uploaded to a client's Brand card live in the database as data: URIs. For an AI they go
// in a .zip to drag and drop next to the prompt — never pasted into the prompt as base64.
export interface BrandFileEntry {
  id: string;
  name: string; // path inside the zip
  data: Uint8Array;
}

export function brandFileEntries(rows: { id: string; category: string; label: string; value: string | null }[]): BrandFileEntry[] {
  const used = new Set<string>();
  const out: BrandFileEntry[] = [];
  for (const r of rows) {
    if (!isDataUri(r.value)) continue;
    const m = /^data:([\w.+-]+\/[\w.+-]+);base64,([\s\S]*)$/i.exec((r.value ?? "").trim());
    if (!m) continue;
    const ext = (m[1].split("/")[1] ?? "bin").replace("svg+xml", "svg").replace("jpeg", "jpg");
    let name = `brand-files/${r.category}/${(r.label || "file").replace(/[^\w.-]+/g, "-")}.${ext}`;
    for (let n = 2; used.has(name); n++) name = name.replace(/(-\d+)?\.(\w+)$/, `-${n}.$2`);
    used.add(name);
    out.push({ id: r.id, name, data: Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0)) });
  }
  return out;
}
