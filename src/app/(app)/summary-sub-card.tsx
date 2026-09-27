// Shared by every Dashboard Summary card (Email, Calendar, ...) — a big
// number with a small label, so the number always reads as the headline
// and the label as a caption. The "row" layout puts the label beside the
// number instead of under it, for a shorter card (used by wide, header-
// level cards spanning multiple grid columns).
export default function SummarySubCard({
  bg,
  text,
  value,
  label,
  layout = "col",
  className,
}: {
  bg: string;
  text: string;
  value: number;
  label: string;
  layout?: "col" | "row";
  className?: string;
}) {
  if (layout === "row") {
    return (
      <div
        className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-center ${bg} ${text} ${className ?? ""}`}
      >
        <span className="font-display text-xl font-bold leading-none sm:text-2xl">
          {value}
        </span>
        <span className="text-xs font-medium leading-tight sm:text-sm">
          {label}
        </span>
      </div>
    );
  }
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg px-1.5 py-2 text-center ${bg} ${text} ${className ?? ""}`}
    >
      <span className="font-display text-lg font-bold leading-none sm:text-xl">
        {value}
      </span>
      <span className="mt-1 text-[9px] font-medium leading-tight sm:text-[10px]">
        {label}
      </span>
    </div>
  );
}
