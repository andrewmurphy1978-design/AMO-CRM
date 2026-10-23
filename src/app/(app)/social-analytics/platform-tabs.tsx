import Link from "next/link";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social";
import { PlatformIcon, ROW_STYLE, type RowStyle } from "../social-card";

// The six platform tabs, each with its real brand colour (Instagram's gradient, TikTok in black with a white mark…).
// Choosing one narrows the current tab (Analytics or Posts) to that platform; choosing it again shows all of them.
const TAB_STYLE: Record<SocialPlatform, RowStyle> = { ...ROW_STYLE, tiktok: { ...ROW_STYLE.tiktok, iconBg: "bg-black", iconFill: "#fff" } };
const ACCENT: Record<SocialPlatform, string> = { facebook: "#1877F2", instagram: "#DD2A7B", linkedin: "#0A66C2", tiktok: "#000000", x: "#000000", youtube: "#FF0000" };

export default function PlatformTabs({ active, tab, names }: { active: SocialPlatform | null; tab: "analytics" | "posts"; names: Record<SocialPlatform, string> }) {
  const href = (platform: SocialPlatform | null) => {
    const q = new URLSearchParams();
    if (tab === "posts") q.set("tab", "posts");
    if (platform) q.set("platform", platform);
    const s = q.toString();
    return `/social-analytics${s ? `?${s}` : ""}`;
  };
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Platforms">
      {SOCIAL_PLATFORMS.map((p) => {
        const on = active === p;
        return (
          <Link
            key={p}
            href={href(on ? null : p)}
            prefetch={false}
            aria-current={on ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${on ? "bg-card-bg text-ink shadow-sm" : "border-card-border bg-card-bg/60 text-soft hover:text-ink"}`}
            style={on ? { borderColor: ACCENT[p], boxShadow: `inset 0 -3px 0 ${ACCENT[p]}` } : undefined}
          >
            <PlatformIcon platform={p} style={TAB_STYLE[p]} />
            {names[p]}
          </Link>
        );
      })}
    </nav>
  );
}
