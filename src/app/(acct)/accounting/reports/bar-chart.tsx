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

export default function BarChart({ labels, series, currency, lang, title }: { labels: string[]; series: Series[]; currency: string; lang: "en" | "fr"; title: string }) {
  const W = 960;
  const H = 340;
  const m = { top: 36, right: 16, bottom: 56, left: 78 };
  const all = series.flatMap((s) => s.values);
  const { lo, hi, step } = niceScale(Math.min(0, ...all), Math.max(0, ...all));
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;
  const y = (v: number) => m.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const groupW = plotW / Math.max(1, labels.length);
  const barW = Math.min(36, (groupW * 0.78) / Math.max(1, series.length));
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  const compact = (v: number) => new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", { notation: "compact", maximumFractionDigits: 1 }).format(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full">
      <title>{title}</title>
      {/* legend */}
      {series.map((s, i) => (
        <g key={s.name} transform={`translate(${m.left + i * 190}, 14)`}>
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
        const gx = m.left + gi * groupW + (groupW - barW * series.length) / 2;
        return (
          <g key={label}>
            {series.map((s, si) => {
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
