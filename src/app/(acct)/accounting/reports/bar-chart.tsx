import { money } from "@/lib/accounting/format";

export interface Series {
  name: string;
  color: string;
  values: number[];
}

// A grouped bar chart drawn as inline SVG: one group per period, one bar per series. Negative values (a net loss) hang below the axis.
function niceScale(min: number, max: number, ticks = 5): { lo: number; hi: number; step: number } {
  const span = Math.max(max - min, 1);
  const raw = span / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

export default function BarChart({ labels, series, currency, lang, title, stacked }: { labels: string[]; series: Series[]; currency: string; lang: "en" | "fr"; title: string; stacked?: boolean }) {
  const W = 960;
  const H = 340;
  const m = { top: 60, right: 16, bottom: 56, left: 78 };
  // Stacked: each period is one bar made of the series (positives up, negatives down), so the scale follows the stack totals.
  const stackTops = labels.map((_, gi) => series.reduce((sum, s) => sum + Math.max(0, s.values[gi] ?? 0), 0));
  const stackBottoms = labels.map((_, gi) => series.reduce((sum, s) => sum + Math.min(0, s.values[gi] ?? 0), 0));
  const all = stacked ? [...stackTops, ...stackBottoms] : series.flatMap((s) => s.values);
  const { lo, hi, step } = niceScale(Math.min(0, ...all), Math.max(0, ...all));
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;
  const y = (v: number) => m.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const groupW = plotW / Math.max(1, labels.length);
  const barW = stacked ? Math.min(54, groupW * 0.7) : Math.min(36, (groupW * 0.78) / Math.max(1, series.length));
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  const compact = (v: number) => new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", { notation: "compact", maximumFractionDigits: 1 }).format(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full">
      <title>{title}</title>
      {/* legend */}
      {series.map((s, i) => (
        <g key={s.name} transform={`translate(${m.left + (i % 4) * 200}, ${10 + Math.floor(i / 4) * 16})`}>
          <rect width={12} height={12} rx={2} fill={s.color} />
          <text x={18} y={11} fontSize={12} fill="currentColor" className="text-ink">{s.name}</text>
        </g>
      ))}
      {/* gridlines and axis */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.5 : 0.12} />
          <text x={m.left - 8} y={y(t) + 4} fontSize={11} textAnchor="end" fill="currentColor" className="text-soft">{compact(t)}</text>
        </g>
      ))}
      {/* bars */}
      {labels.map((label, gi) => {
        const gx = m.left + gi * groupW + (groupW - barW * (stacked ? 1 : series.length)) / 2;
        let up = 0;
        let down = 0;
        return (
          <g key={label}>
            {stacked && series.map((s) => {
              const v = s.values[gi] ?? 0;
              if (v === 0) return null;
              const from = v > 0 ? up : down;
              const to = from + v;
              if (v > 0) up = to;
              else down = to;
              const top = Math.min(y(from), y(to));
              return (
                <rect key={s.name} x={gx} y={top} width={barW - 2} height={Math.max(1, Math.abs(y(to) - y(from)))} fill={s.color}>
                  <title>{`${label} — ${s.name}: ${money(v, currency, lang)}`}</title>
                </rect>
              );
            })}
            {!stacked && series.map((s, si) => {
              const v = s.values[gi] ?? 0;
              const top = Math.min(y(v), y(0));
              const h = Math.max(1, Math.abs(y(v) - y(0)));
              return (
                <rect key={s.name} x={gx + si * barW} y={top} width={barW - 2} height={h} rx={2} fill={s.color}>
                  <title>{`${label} — ${s.name}: ${money(v, currency, lang)}`}</title>
                </rect>
              );
            })}
            <text x={m.left + gi * groupW + groupW / 2} y={H - m.bottom + 18} fontSize={11} textAnchor="middle" fill="currentColor" className="text-soft">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}
