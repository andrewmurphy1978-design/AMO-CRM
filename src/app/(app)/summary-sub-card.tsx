import { formatHoursFraction } from "@/lib/calendar-time";

// Shared by every Dashboard Summary card (Email, Calendar, ...) — a big
// number with a small label, so the number always reads as the headline
// and the label as a caption. The "row" layout puts the label beside the
// number instead of under it, for a shorter card (used by wide, header-
// level cards spanning multiple grid columns).
//
// Both layouts share a fixed height (matching the Calendar Summary card's
// own bespoke 3-line Haley/Lukas/Mom card) so every sub-card in a metrics
// row lines up regardless of how many lines its own content takes.
const SUB_CARD_HEIGHT = "h-14 sm:h-16";

export default function SummarySubCard({
  bg,
  text,
  value,
  label,
  hours,
  layout = "col",
  className,
}: {
  bg: string;
  text: string;
  value: number;
  label: string;
  // Total event-hours behind this count (e.g. shift/meeting duration) —
  // shown beside the value, smaller, as a rounded-to-the-quarter-hour
  // fraction ("40½h") rather than under it like the label.
  hours?: number;
  layout?: "col" | "row";
  className?: string;
}) {
  const hoursSuffix =
    hours !== undefined ? (
      <span className="text-[10px] font-bold leading-none sm:text-xs">
        {formatHoursFraction(hours)}h
      </span>
    ) : null;

  if (layout === "row") {
    return (
      <div
        className={`flex ${SUB_CARD_HEIGHT} min-w-0 items-center justify-center gap-2 overflow-hidden rounded-lg px-2 py-2 text-center ${bg} ${text} ${className ?? ""}`}
      >
        <span className="flex shrink-0 items-baseline gap-1">
          <span className="font-display text-xl font-bold leading-none sm:text-2xl">
            {value}
          </span>
          {hoursSuffix}
        </span>
        <span className="min-w-0 truncate text-xs font-medium leading-tight sm:text-sm">
          {label}
        </span>
      </div>
    );
  }
  return (
    <div
      className={`flex ${SUB_CARD_HEIGHT} min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg px-1.5 py-2 text-center ${bg} ${text} ${className ?? ""}`}
    >
      <span className="flex items-baseline gap-1">
        <span className="font-display text-lg font-bold leading-none sm:text-xl">
          {value}
        </span>
        {hoursSuffix}
      </span>
      <span className="mt-1 line-clamp-2 w-full text-[9px] font-medium leading-tight sm:text-[10px]">
        {label}
      </span>
    </div>
  );
}
