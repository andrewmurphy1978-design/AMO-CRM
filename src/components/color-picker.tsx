"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Square + hue slider + hex field (+ eyedropper where the browser has one),
// opened from a colour swatch. The panel is portalled and fixed-positioned so
// a scrolling dialog can't clip it.

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`.toUpperCase();
}

export default function ColorPicker({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [hsv, setHsv] = useState<[number, number, number]>([0, 1, 1]);
  const [hexText, setHexText] = useState(value);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  const rgb = hexToRgb(value);
  const swatch = rgb ? `#${value.replace(/^#/, "")}` : "transparent";

  function toggle() {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      const width = 280;
      const height = 330;
      const top = r.bottom + 8 + height > window.innerHeight ? Math.max(8, r.top - height - 8) : r.bottom + 8;
      setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
      const parsed = hexToRgb(value);
      if (parsed) setHsv(rgbToHsv(...parsed));
      setHexText(parsed ? hsvToHex(...rgbToHsv(...parsed)) : "#");
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function apply(next: [number, number, number]) {
    setHsv(next);
    const hex = hsvToHex(...next);
    setHexText(hex);
    onChange(hex);
  }

  function drag(el: HTMLDivElement | null, e: React.PointerEvent, fn: (x: number, y: number) => void) {
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    };
    move(e.nativeEvent);
    el.onpointermove = move;
    el.onpointerup = () => {
      el.onpointermove = null;
      el.onpointerup = null;
    };
  }

  const eyeDropper = typeof window !== "undefined" ? (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper : undefined;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label ?? "Pick a colour"}
        className="h-7 w-7 shrink-0 rounded border border-card-border"
        style={{ backgroundColor: swatch }}
      />
      {open &&
        pos &&
        createPortal(
          <div ref={panelRef} style={{ top: pos.top, left: pos.left, width: 280 }} className="fixed z-[70] space-y-3 rounded-2xl border border-card-border bg-card-bg p-3 shadow-2xl">
            <div
              ref={svRef}
              onPointerDown={(e) => drag(svRef.current, e, (x, y) => apply([hsv[0], x, 1 - y]))}
              className="relative h-44 w-full cursor-crosshair touch-none rounded-xl"
              style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv[0]}, 100%, 50%))` }}
            >
              <span
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }}
              />
            </div>
            <div
              ref={hueRef}
              onPointerDown={(e) => drag(hueRef.current, e, (x) => apply([x * 360, hsv[1], hsv[2]]))}
              className="relative h-3 w-full cursor-pointer touch-none rounded-full"
              style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}
            >
              <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${(hsv[0] / 360) * 100}%` }} />
            </div>
            <div className="flex items-center gap-2">
              <span className="h-8 w-8 shrink-0 rounded-full border border-card-border" style={{ backgroundColor: hsvToHex(...hsv) }} />
              <input
                value={hexText}
                onChange={(e) => {
                  const text = e.target.value;
                  setHexText(text);
                  const parsed = hexToRgb(text);
                  if (parsed) {
                    const next = rgbToHsv(...parsed);
                    setHsv(next);
                    onChange(hsvToHex(...next));
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm uppercase text-ink"
                spellCheck={false}
              />
              {eyeDropper && (
                <button
                  type="button"
                  title="Pick from screen"
                  onClick={async () => {
                    try {
                      const { sRGBHex } = await new eyeDropper().open();
                      const parsed = hexToRgb(sRGBHex);
                      if (parsed) apply(rgbToHsv(...parsed));
                    } catch {
                      // cancelled
                    }
                  }}
                  className="rounded-md border border-card-border px-2 py-1.5 text-sm hover:bg-black/5"
                >
                  💧
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
