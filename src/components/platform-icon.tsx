import { platformIconUrl, platformBrandColor } from "@/lib/platform-icons";

// Generic globe glyph for platforms with no real brand icon ("Website",
// "Other", imo) — kept inline since it's not a brand mark.
function GenericIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.7 3.8 6 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-6-3.8-9s1.3-6.3 3.8-9Z" />
    </svg>
  );
}

// Apple doesn't publish a Simple Icons brand mark for FaceTime (it's an app
// icon, not a company logo), so it's hand-drawn here instead of masked from
// a CDN source like every other platform below.
function FaceTimeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#4CD964" />
      <path
        fill="white"
        d="M6.5 8.5A1.5 1.5 0 0 1 8 7h5a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 17H8a1.5 1.5 0 0 1-1.5-1.5v-7Z"
      />
      <path fill="white" d="m15.5 10.8 2.6-1.9c.4-.3.9 0 .9.5v5.2c0 .5-.5.8-.9.5l-2.6-1.9v-2.4Z" />
    </svg>
  );
}

// Every real brand icon is drawn the same way: jsdelivr's monochrome Simple
// Icons SVG used purely as a CSS mask shape, filled with that brand's own
// color via backgroundColor — see platform-icons.ts for why (no third-party
// "pre-colored" icon CDN turned out to reliably cover every slug this app
// needs).
export default function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  if (platform === "FaceTime") return <FaceTimeIcon className={className} />;

  const url = platformIconUrl(platform);
  if (!url) return <GenericIcon className={`${className} text-soft`} />;

  const color = platformBrandColor(platform) ?? "currentColor";
  return (
    <span
      role="img"
      aria-label={platform}
      className={`inline-block shrink-0 ${className}`}
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url(${url})`,
        maskImage: `url(${url})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
