import { platformIconUrl } from "@/lib/platform-icons";

// Generic globe glyph for platforms with no real brand icon ("Website",
// "Other") — kept inline since it's not a brand mark.
function GenericIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.7 3.8 6 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-6-3.8-9s1.3-6.3 3.8-9Z" />
    </svg>
  );
}

export default function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  const url = platformIconUrl(platform);
  if (!url) return <GenericIcon className={`${className} text-soft`} />;
  // eslint-disable-next-line @next/next/no-img-element -- external brand-icon CDN, not a local asset
  return <img src={url} alt={platform} className={className} />;
}
