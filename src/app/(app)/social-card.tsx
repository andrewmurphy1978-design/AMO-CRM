import clsx from "@/lib/clsx";
import type { SocialSnapshotView } from "@/lib/social";

export interface SocialLabels {
  title: string;
  empty: string;
  followers: string;
  engagement: string;
  views: string;
  platformNames: Record<string, string>;
}

const PLATFORM_COLOR: Record<string, string> = {
  facebook: "bg-[#1877F2]",
  instagram: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  linkedin: "bg-[#0A66C2]",
  youtube: "bg-[#FF0000]",
  tiktok: "bg-[#010101]",
  x: "bg-[#000000]",
};

function PlatformDot({ platform }: { platform: string }) {
  return <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", PLATFORM_COLOR[platform] ?? "bg-soft")} />;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;
  return (
    <span className={clsx("ml-1.5 text-xs font-medium", delta > 0 ? "text-emerald-600" : "text-red-600")}>
      {delta > 0 ? "+" : ""}
      {delta.toLocaleString()}
    </span>
  );
}

export default function SocialCard({ snapshots, labels }: { snapshots: SocialSnapshotView[]; labels: SocialLabels }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
      {snapshots.length === 0 ? (
        <p className="mt-3 text-sm text-soft">{labels.empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {snapshots.map((s) => (
            <li key={s.platform} className="text-sm">
              <div className="flex items-center gap-2">
                <PlatformDot platform={s.platform} />
                <span className="font-medium text-ink">{labels.platformNames[s.platform] ?? s.platform}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 pl-[18px] text-xs text-soft">
                {s.followers !== null && (
                  <span>
                    {labels.followers}: <span className="font-medium text-ink">{s.followers.toLocaleString()}</span>
                    <DeltaBadge delta={s.followersDelta} />
                  </span>
                )}
                {s.engagement !== null && (
                  <span>
                    {labels.engagement}: <span className="font-medium text-ink">{s.engagement.toLocaleString()}</span>
                  </span>
                )}
                {s.views !== null && (
                  <span>
                    {labels.views}: <span className="font-medium text-ink">{s.views.toLocaleString()}</span>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
