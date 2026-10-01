import type { ReactNode } from "react";

// One accent color per section, keyed by name and shared between the
// Contact Edit form and Contact Info (detail) page so a given section
// always looks the same color on both — same "solid header bar" approach
// as the Email page's category sections.
export const CARD_COLORS = {
  general: "bg-emerald-600",
  personal: "bg-purple-600",
  contact: "bg-sky-600",
  addresses: "bg-amber-500",
  techStack: "bg-slate-600",
  social: "bg-violet-600",
  voip: "bg-indigo-600",
  other: "bg-teal-600",
  notes: "bg-stone-500",
  billing: "bg-yellow-600",
  domains: "bg-cyan-700",
  brand: "bg-purple-700",
  relations: "bg-fuchsia-700",
  credentials: "bg-red-700",
  projects: "bg-rose-600",
  phases: "bg-pink-700",
  tasks: "bg-blue-700",
  calendarEvents: "bg-cyan-600",
  linkedEmails: "bg-fuchsia-600",
  purchases: "bg-lime-700",
  proposals: "bg-orange-600",
  invoices: "bg-yellow-700",
  interactions: "bg-pink-600",
  activity: "bg-gray-600",
  statistics: "bg-blue-600",
  marketingActive: "bg-emerald-700",
  marketingPending: "bg-amber-600",
  marketingNoProgram: "bg-red-600",
} as const;

export type CardColor = keyof typeof CARD_COLORS;

export default function Card({
  color,
  title,
  actions,
  children,
  // Tighter header/body padding on mobile (unchanged at sm+) — opt-in so
  // every other page using this shared component keeps its current
  // spacing; only the Contact Info page's dense multi-card layout asks
  // for this today.
  compact,
  flushTop,
}: {
  color: CardColor;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  // A small, fixed gap between the header bar and the first thing in the
  // body instead of the full card padding (for lists whose rows already
  // carry their own spacing).
  flushTop?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
      <div
        className={`flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-white ${CARD_COLORS[color]} ${compact ? "px-2 py-1.5 sm:px-4 sm:py-2" : "px-4 py-2"}`}
      >
        <span className="flex items-center gap-2">{title}</span>
        {actions}
      </div>
      <div
        className={`${compact ? "space-y-2 p-2 sm:space-y-4 sm:p-4" : "space-y-4 p-4"}${flushTop ? " pt-2!" : ""}`}
      >
        {children}
      </div>
    </section>
  );
}
