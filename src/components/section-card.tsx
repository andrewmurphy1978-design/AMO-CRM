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
  projects: "bg-rose-600",
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
}: {
  color: CardColor;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
      <div className={`flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white ${CARD_COLORS[color]}`}>
        <span>{title}</span>
        {actions}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}
