"use client";

import { useFileDrop, DROP_RING } from "@/components/use-file-drop";
import { useRef, useState } from "react";
import { AVATAR_COLORS, initialsFor, initialsAvatarDataUri } from "@/lib/avatar";

// Resizes/re-encodes an uploaded image client-side before it goes anywhere
// — Contact.avatarUrl is a plain Postgres text column with no dedicated
// object storage behind it (no R2 bucket exists in this app yet), so a
// small, capped JPEG data URI is what actually gets saved.
function resizeImageFile(file: File, maxDimension = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unsupported"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function AvatarPicker({
  name,
  defaultValue,
  firstName,
  lastName,
  labels,
}: {
  name: string;
  defaultValue?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  labels: { upload: string; orChoose: string; remove: string };
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initials = initialsFor(firstName, lastName);
  const drop = useFileDrop(async (files) => {
    const file = files[0];
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setValue(await resizeImageFile(file));
    } catch {
      /* unreadable file: keep the current avatar */
    }
  });

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <div {...drop.bind} className={`flex flex-col items-center gap-2 rounded-lg p-1 ${drop.dragging ? DROP_RING : ""}`}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- either an external Google-hosted URL or a locally-generated data URI, not a local/optimizable asset
          <img src={value} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-black/10 text-lg font-semibold text-soft">
            {initials}
          </div>
        )}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-card-border bg-field-bg px-2.5 py-1 text-xs font-semibold text-ink shadow-sm hover:bg-black/5"
            >
              {labels.upload}
            </button>
            {value && (
              <button type="button" onClick={() => setValue("")} className="text-xs text-soft hover:underline">
                {labels.remove}
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                setValue(await resizeImageFile(file));
              } catch {
                // Silently ignore an unreadable file — the picker simply keeps
                // whatever avatar was already selected.
              }
            }}
          />
          <p className="text-[11px] text-soft">{labels.orChoose}</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {AVATAR_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setValue(initialsAvatarDataUri(initials, color))}
                title={color}
                className="h-6 w-6 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
