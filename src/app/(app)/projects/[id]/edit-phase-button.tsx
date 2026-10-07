"use client";

// "Edit" next to the active phase's name: opens the phase editor straight on that phase.
export default function EditPhaseButton({ phaseId, lang }: { phaseId: string; lang: "en" | "fr" }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("amo:edit-phase", { detail: { phaseId } }))}
      className="ml-2 rounded border border-card-border px-1.5 py-0.5 text-[11px] font-medium normal-case text-soft hover:bg-black/5 hover:text-ink"
    >
      ✏ {lang === "fr" ? "Modifier la phase" : "Edit phase"}
    </button>
  );
}
