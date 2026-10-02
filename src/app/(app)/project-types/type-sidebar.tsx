"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveProjectTypeOrder } from "@/actions/project-types";
import NewTypeButton from "./new-type-button";

// The project-type list: pick a type, or drag the ⠿ handle to reorder.
export default function TypeSidebar({
  keys,
  labels,
  saved,
  selected,
  lang,
}: {
  keys: string[];
  labels: Record<string, string>;
  saved: string[];
  selected: string;
  lang: "en" | "fr";
}) {
  const router = useRouter();
  const [order, setOrder] = useState(keys);
  const [armed, setArmed] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Pick up types added or removed elsewhere.
  const [seen, setSeen] = useState(keys);
  if (seen !== keys) {
    setSeen(keys);
    setOrder(keys);
  }

  function drop(to: string) {
    if (dragFrom && dragFrom !== to) {
      const next = [...order];
      const [item] = next.splice(next.indexOf(dragFrom), 1);
      next.splice(next.indexOf(to), 0, item);
      setOrder(next);
      void saveProjectTypeOrder(next).then(() => router.refresh());
    }
    setDragFrom(null);
    setDragOver(null);
    setArmed(null);
  }

  return (
    <nav
      aria-label={lang === "fr" ? "Types de projet" : "Project types"}
      className="flex flex-wrap gap-2 md:sticky md:top-20 md:max-h-[calc(100dvh-6rem)] md:flex-col md:flex-nowrap md:gap-1 md:overflow-y-auto md:rounded-2xl md:border md:border-card-border md:bg-card-bg md:p-2 md:shadow-sm"
    >
      {order.map((tp) => (
        <div
          key={tp}
          draggable={armed === tp}
          onDragStart={(e) => {
            setDragFrom(tp);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", tp);
          }}
          onDragOver={(e) => {
            if (!dragFrom) return;
            e.preventDefault();
            if (dragOver !== tp) setDragOver(tp);
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop(tp);
          }}
          onDragEnd={() => {
            setDragFrom(null);
            setDragOver(null);
            setArmed(null);
          }}
          className={`flex items-center gap-1 ${dragFrom === tp ? "opacity-50" : ""} ${dragOver === tp && dragFrom !== tp ? "rounded-lg ring-2 ring-emerald-600" : ""}`}
        >
          <span
            title={lang === "fr" ? "Glisser pour déplacer" : "Drag to move"}
            onMouseDown={() => setArmed(tp)}
            onMouseUp={() => setArmed(null)}
            className="hidden cursor-grab select-none px-0.5 text-sm leading-none text-soft hover:text-ink md:inline"
            aria-hidden
          >
            ⠿
          </span>
          <Link
            href={`/project-types?type=${tp}`}
            scroll={false}
            className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-sm font-medium md:rounded-lg md:border-transparent ${tp === selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-card-border bg-card-bg text-ink hover:border-amo-gold md:bg-transparent md:hover:bg-black/5"}`}
          >
            <span className="min-w-0 truncate">{labels[tp] ?? tp}</span>
            {saved.includes(tp) && <span className="text-[10px] opacity-80">●</span>}
          </Link>
        </div>
      ))}
      <NewTypeButton lang={lang} />
    </nav>
  );
}
