// Small badge shown beside the title on the Post Summary and Post Details cards — purely decorative, teal like the
// cards' identity color (see posts-summary-colors.ts), same convention as SocialIcon / AutomationsIcon.
export default function PostsIcon({ size = "h-10 w-10", iconSize = "h-6 w-6", className }: { size?: string; iconSize?: string; className?: string }) {
  return (
    <span className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-600 ${className ?? ""}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={iconSize}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5.25h18M3 12h18M3 18.75h10.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m17.25 16.5 1.5 1.5 3-3" />
      </svg>
    </span>
  );
}
