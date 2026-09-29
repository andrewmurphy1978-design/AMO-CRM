export interface TrendSeries {
  label: string;
  color: string;
  // One value per dateKey in the shared x-axis below — null where that
  // day has no data for this series (e.g. a language with fewer days of
  // history than another), which breaks the line rather than lying about
  // a value that was never captured.
  values: Map<string, number>;
}

// Dependency-free SVG line chart — no chart library is installed in this
// app, and a handful of straight `polyline`s is all a follower/engagement
// trend needs. `viewBox` uses 0-100 on both axes and `preserveAspectRatio
// ="none"` so the chart stretches to whatever box its parent gives it;
// `vectorEffect="non-scaling-stroke"` keeps the line width constant
// through that stretch instead of scaling with the (very non-square)
// viewBox.
export default function TrendChart({
  dateKeys,
  series,
  emptyLabel,
}: {
  dateKeys: string[];
  series: TrendSeries[];
  emptyLabel: string;
}) {
  if (dateKeys.length < 2) {
    return <p className="flex h-24 items-center justify-center text-xs text-soft">{emptyLabel}</p>;
  }

  const allValues = series.flatMap((s) => dateKeys.map((d) => s.values.get(d)).filter((v): v is number => v !== undefined));
  const min = allValues.length > 0 ? Math.min(0, ...allValues) : 0;
  const max = allValues.length > 0 ? Math.max(1, ...allValues) : 1;
  const span = max - min || 1;

  const xFor = (i: number) => (i / (dateKeys.length - 1)) * 100;
  const yFor = (v: number) => 100 - ((v - min) / span) * 100;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-24 w-full overflow-visible">
      {series.map((s) => {
        const points = dateKeys
          .map((d, i) => {
            const v = s.values.get(d);
            return v === undefined ? null : `${xFor(i)},${yFor(v)}`;
          })
          .filter((p): p is string => p !== null);
        if (points.length < 2) return null;
        return (
          <polyline
            key={s.label}
            points={points.join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
