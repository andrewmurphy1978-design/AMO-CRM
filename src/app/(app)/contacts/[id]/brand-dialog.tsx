"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ColorPicker from "@/components/color-picker";
import { type Lang } from "@/lib/i18n/dictionaries";
import { getDict } from "@/lib/i18n/dictionaries";
import { CARD_COLORS } from "@/components/section-card";
import { BRAND_CATEGORIES, BRAND_FONTS, MAX_BRAND_FILE_BYTES, dataUriIsImage, isDataUri, type BrandItemInput } from "@/lib/brand";
import SectionDialog, { EditCardButton } from "./section-dialog";

const FIELD = "w-full min-w-0 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

// Reads a picked file as a data: URI. Raster images are shrunk to at most
// 1200px and re-encoded (WebP keeps logo transparency), so they stay small;
// SVGs and other files are kept as they are, up to the size limit.
async function fileToDataUri(file: File): Promise<{ uri?: string; error?: string }> {
  const readAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  const tooBig = { error: `${file.name}: too large (max ${Math.round(MAX_BRAND_FILE_BYTES / 1000)} KB after compression).` };
  const raw = await readAsDataUrl(file);
  const isRaster = /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.type);
  if (!isRaster) return raw.length * 0.75 <= MAX_BRAND_FILE_BYTES ? { uri: raw } : tooBig;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("bad image"));
    img.src = raw;
  }).catch(() => undefined);
  if (!img.width) return { error: `${file.name}: couldn't read this image.` };
  for (const max of [1200, 800, 500]) {
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const uri = canvas.toDataURL("image/webp", 0.85);
    if (uri.length * 0.75 <= MAX_BRAND_FILE_BYTES) return { uri };
  }
  return tooBig;
}

// Text field with a styled, filterable drop-down of suggestions (free text is
// still accepted). Portalled so the dialog's scroll area can't clip it.
function FontCombo({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  function show() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setTyped(false);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || inputRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = typed ? value.trim().toLowerCase() : "";
  const filtered = BRAND_FONTS.filter((f) => f.toLowerCase().includes(q));

  return (
    <>
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setTyped(true);
            if (!open) show();
          }}
          onFocus={show}
          placeholder={placeholder}
          autoComplete="off"
          style={{ fontFamily: value ? `"${value}", sans-serif` : undefined }}
          className={`${FIELD} pr-7`}
        />
        <button type="button" tabIndex={-1} onClick={() => (open ? setOpen(false) : show())} className="absolute inset-y-0 right-0 px-2 text-soft" aria-label="Show fonts">
          ▾
        </button>
      </div>
      {open &&
        pos &&
        filtered.length > 0 &&
        createPortal(
          <ul ref={panelRef} style={{ top: pos.top, left: pos.left, width: pos.width }} className="fixed z-[70] max-h-60 overflow-y-auto rounded-md border border-card-border bg-card-bg py-1 text-sm shadow-xl">
            {filtered.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(f);
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-ink hover:bg-black/5"
                >
                  {f}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  );
}

// Link field + "Choose file" button for the image-style categories. A picked
// file replaces the link and shows as a small preview with a Remove button.
function FileOrLink({
  value,
  onChange,
  onPicked,
  placeholder,
  fr,
}: {
  value: string;
  onChange: (v: string) => void;
  onPicked: (uri: string, name: string) => void;
  placeholder: string;
  fr: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uploaded = isDataUri(value);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await fileToDataUri(file);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.uri) onPicked(result.uri, file.name);
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*,.svg,.pdf,.ai,.eps,.psd" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex items-center gap-1.5">
        {uploaded ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-card-border bg-field-bg px-2 py-1">
            {dataUriIsImage(value) ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URI preview
              <img src={value} alt="" className="h-7 w-10 shrink-0 rounded object-contain" />
            ) : (
              <span className="text-xs">📎</span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-ink">{fr ? "Fichier téléversé" : "Uploaded file"}</span>
            <button type="button" onClick={() => onChange("")} className="text-xs text-red-600 hover:underline">
              {fr ? "Retirer" : "Remove"}
            </button>
          </div>
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={FIELD} />
        )}
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="shrink-0 rounded-md border border-card-border px-2 py-1.5 text-xs font-medium text-ink hover:bg-black/5 disabled:opacity-50">
          {busy ? "…" : fr ? "Choisir un fichier" : "Choose file"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function BrandDialog({
  action,
  items,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  items: BrandItemInput[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const fr = lang === "fr";
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BrandItemInput[]>(items);

  const update = (index: number, patch: Partial<BrandItemInput>) => setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <>
      <EditCardButton
        onClick={() => {
          setRows(items);
          setOpen(true);
        }}
        label={t.contactDetail.edit}
      />
      <SectionDialog open={open} onOpenChange={setOpen} title="Brand" action={action} labels={t.phaseDialog} wide headerColorClassName={CARD_COLORS.brand}>
        <input type="hidden" name="brand" value={JSON.stringify(rows)} />
        <div className="space-y-5">
          {BRAND_CATEGORIES.map((cat) => {
            const catRows = rows.map((row, index) => ({ row, index })).filter((x) => x.row.category === cat.key);
            return (
              <section key={cat.key}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-soft">{fr ? cat.fr : cat.en}</h4>
                  <button
                    type="button"
                    onClick={() => setRows((r) => [...r, { category: cat.key, label: "", value: cat.mode === "color" ? "#" : "", note: "" }])}
                    className="rounded-md border border-card-border px-2 py-0.5 text-xs font-medium text-ink hover:bg-black/5"
                  >
                    + {fr ? "Ajouter" : "Add"}
                  </button>
                </div>
                <div className="mt-1 space-y-2">
                  {catRows.length === 0 && <p className="text-xs text-soft">—</p>}
                  {catRows.map(({ row, index }) => (
                    <div key={index} className="grid grid-cols-1 gap-1.5 rounded-lg bg-black/[0.03] p-2 sm:grid-cols-[1fr_1.6fr_1fr_auto]">
                      {cat.mode === "font" ? (
                        <FontCombo value={row.label} onChange={(v) => update(index, { label: v })} placeholder={fr ? cat.labelHint.fr : cat.labelHint.en} />
                      ) : (
                        <input value={row.label} onChange={(e) => update(index, { label: e.target.value })} placeholder={fr ? cat.labelHint.fr : cat.labelHint.en} className={FIELD} />
                      )}
                      {cat.mode === "text" ? (
                        <textarea rows={2} value={row.value} onChange={(e) => update(index, { value: e.target.value })} placeholder={fr ? cat.valueHint.fr : cat.valueHint.en} className={FIELD} />
                      ) : cat.mode === "color" ? (
                        <div className="flex items-center gap-1.5">
                          <ColorPicker value={row.value} onChange={(hex) => update(index, { value: hex })} label={fr ? "Choisir une couleur" : "Pick a colour"} />
                          <input value={row.value} onChange={(e) => update(index, { value: e.target.value })} placeholder={fr ? cat.valueHint.fr : cat.valueHint.en} className={FIELD} />
                        </div>
                      ) : cat.mode === "image" ? (
                        <FileOrLink
                          value={row.value}
                          onChange={(v) => update(index, { value: v })}
                          onPicked={(uri, name) => update(index, { value: uri, label: row.label || name.replace(/\.[^.]+$/, "") })}
                          placeholder={fr ? cat.valueHint.fr : cat.valueHint.en}
                          fr={fr}
                        />
                      ) : (
                        <input value={row.value} onChange={(e) => update(index, { value: e.target.value })} placeholder={fr ? cat.valueHint.fr : cat.valueHint.en} className={FIELD} />
                      )}
                      <input value={row.note} onChange={(e) => update(index, { note: e.target.value })} placeholder={fr ? "Note" : "Note"} className={FIELD} />
                      <button type="button" onClick={() => setRows((r) => r.filter((_, i) => i !== index))} className="rounded-md px-2 text-sm text-red-600 hover:bg-red-50" aria-label="Remove">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </SectionDialog>
    </>
  );
}
