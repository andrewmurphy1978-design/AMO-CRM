import { formatDistanceToNow } from "date-fns";
import type { Locale } from "date-fns";
import clsx from "@/lib/clsx";
import { SOCIAL_PLATFORMS, type ExtraStatKey, type SocialPlatform, type SocialSnapshotView } from "@/lib/social";
import SocialSyncButton from "./social-sync-button";

export interface SocialLabels {
  title: string;
  empty: string;
  followers: string;
  engagement: string;
  views: string;
  statLabels: Record<ExtraStatKey, string>;
  languageEn: string;
  languageFr: string;
  platformNames: Record<string, string>;
  updatedPrefix: string;
  syncNow: string;
  syncing: string;
}

interface RowStyle {
  rowBg: string;
  text: string;
  soft: string;
  iconBg: string;
  iconFill: string;
}

// Row tint follows each platform's own brand color, per explicit request —
// most are a light tint so text stays readable, except TikTok (asked for
// as solid black) which flips to light text instead.
const ROW_STYLE: Record<SocialPlatform, RowStyle> = {
  facebook: { rowBg: "bg-[#1877F2]/10", text: "text-ink", soft: "text-soft", iconBg: "bg-[#1877F2]", iconFill: "#fff" },
  instagram: { rowBg: "bg-red-50", text: "text-ink", soft: "text-soft", iconBg: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]", iconFill: "#fff" },
  linkedin: { rowBg: "bg-sky-50", text: "text-ink", soft: "text-soft", iconBg: "bg-[#0A66C2]", iconFill: "#fff" },
  tiktok: { rowBg: "bg-neutral-900", text: "text-white", soft: "text-white/60", iconBg: "bg-white", iconFill: "#000" },
  x: { rowBg: "bg-neutral-100", text: "text-ink", soft: "text-soft", iconBg: "bg-black", iconFill: "#fff" },
  youtube: { rowBg: "bg-red-100", text: "text-ink", soft: "text-soft", iconBg: "bg-[#FF0000]", iconFill: "#fff" },
};

function PlatformIcon({ platform, style }: { platform: SocialPlatform; style: RowStyle }) {
  const paths: Record<SocialPlatform, string> = {
    facebook:
      "M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z",
    instagram:
      "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 7.838c-2.301 0-4.163 1.865-4.163 4.163S9.699 16.162 12 16.162s4.162-1.863 4.162-4.161-1.86-4.163-4.162-4.163zm6.406-2.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z",
    linkedin:
      "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667h-3.554V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
    x: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
    tiktok:
      "M19.321 5.562a5.124 5.124 0 0 1-3.414-3.414h-3.257v13.512c0 1.457-1.185 2.641-2.642 2.641a2.643 2.643 0 0 1-2.642-2.641 2.643 2.643 0 0 1 2.642-2.642c.291 0 .571.048.833.135V9.813a5.888 5.888 0 0 0-.833-.06 5.902 5.902 0 0 0-5.902 5.902 5.902 5.902 0 0 0 5.902 5.901 5.902 5.902 0 0 0 5.902-5.901V9.283a8.354 8.354 0 0 0 4.87 1.561V7.588a5.109 5.109 0 0 1-1.459-2.026z",
    youtube:
      "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z",
  };
  return (
    <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", style.iconBg)}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill={style.iconFill}>
        <path d={paths[platform]} />
      </svg>
    </span>
  );
}

function fmt(n: number): string {
  return n.toLocaleString();
}

interface StatLine {
  key: string;
  label: string;
  value: number;
}

// Fixed label width (not %-based) so a number's left edge lands at the
// same x-position in every cell across the whole table — not just within
// one platform's row — regardless of how long that row's own labels are.
const LABEL_WIDTH = "w-[4.5rem]";

function StatCell({ snapshot, labels, soft }: { snapshot: SocialSnapshotView | undefined; labels: SocialLabels; soft: string }) {
  if (!snapshot) return <span className={soft}>—</span>;

  const lines: StatLine[] = [];
  if (snapshot.followers !== null) lines.push({ key: "followers", label: labels.followers, value: snapshot.followers });
  if (snapshot.engagement !== null) lines.push({ key: "engagement", label: labels.engagement, value: snapshot.engagement });
  if (snapshot.views !== null) lines.push({ key: "views", label: labels.views, value: snapshot.views });
  for (const stat of snapshot.extraStats) {
    // Already surfaced as "views" above — don't show them twice.
    if (stat.key === "reach" || stat.key === "impressions") continue;
    lines.push({ key: stat.key, label: labels.statLabels[stat.key], value: stat.value });
  }

  if (lines.length === 0) return <span className={soft}>—</span>;
  return (
    <div className="space-y-0.5 text-xs leading-tight">
      {lines.map((line) => (
        <div key={line.key} className="flex items-baseline">
          <span className={clsx(LABEL_WIDTH, "shrink-0", soft)}>{line.label}</span>
          {/* Fixed width + right-align so every value's last digit lands
              at the same x-position down the whole table, with a
              consistent gap (not just squeezed against the label). */}
          <span className="ml-5 w-10 shrink-0 text-right font-medium tabular-nums">{fmt(line.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function SocialCard({
  snapshots,
  labels,
  isAdmin,
  dateLocale,
}: {
  snapshots: SocialSnapshotView[];
  labels: SocialLabels;
  isAdmin: boolean;
  dateLocale: Locale | undefined;
}) {
  const byKey = new Map(snapshots.map((s) => [`${s.platform}|${s.language}`, s]));
  const hasAnyData = snapshots.length > 0;
  const lastSyncedAt = snapshots.reduce<Date | null>(
    (latest, s) => (!latest || s.capturedAt > latest ? s.capturedAt : latest),
    null
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
          {lastSyncedAt && (
            <p className="mt-0.5 text-xs text-soft">
              {labels.updatedPrefix} {formatDistanceToNow(lastSyncedAt, { addSuffix: true, locale: dateLocale })}
            </p>
          )}
        </div>
        {isAdmin && <SocialSyncButton label={labels.syncNow} loadingLabel={labels.syncing} />}
      </div>
      {!hasAnyData ? (
        <p className="mt-3 text-sm text-soft">{labels.empty}</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-card-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-card-border bg-field-bg text-xs font-semibold uppercase tracking-wide text-soft">
                <th className="w-12 py-2 pl-3 text-left"></th>
                <th className="py-2 pl-2 text-left">{labels.languageEn}</th>
                <th className="py-2 pl-2 pr-3 text-left">{labels.languageFr}</th>
              </tr>
            </thead>
            <tbody>
              {SOCIAL_PLATFORMS.map((platform) => {
                const style = ROW_STYLE[platform];
                return (
                  <tr key={platform} className={clsx("border-b border-card-border/60 last:border-b-0", style.rowBg)}>
                    <td className="py-3 pl-3">
                      <div className="flex items-center gap-2">
                        <PlatformIcon platform={platform} style={style} />
                        <span className={clsx("text-xs font-medium", style.text)}>{labels.platformNames[platform]}</span>
                      </div>
                    </td>
                    <td className={clsx("py-3 pl-2 align-top", style.text)}>
                      <StatCell snapshot={byKey.get(`${platform}|EN`)} labels={labels} soft={style.soft} />
                    </td>
                    <td className={clsx("py-3 pl-2 pr-3 align-top", style.text)}>
                      <StatCell snapshot={byKey.get(`${platform}|FR`)} labels={labels} soft={style.soft} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
