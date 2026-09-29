export interface BarDatum {
  key: string;
  label: string;
  value: number;
  color: string;
}

// Simple horizontal bar chart — a colored div scaled by percentage width,
// not an SVG, since a plain filled rectangle needs neither an external
// chart library nor the extra ceremony of an SVG viewBox (see TrendChart
// for where SVG actually earns its keep — a diagonal line).
export default function BarChart({ data, emptyLabel }: { data: BarDatum[]; emptyLabel: string }) {
  if (data.length === 0) {
    return <p className="flex h-16 items-center justify-center text-xs text-soft">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.key} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-xs text-soft">{d.label}</span>
          <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-black/5">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-ink">
            {d.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
