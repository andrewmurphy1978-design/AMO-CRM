// Small sun badge for "Daily Briefing" — amber identity color. `size`/`iconSize` default to the h-10/h-6 badge used
// elsewhere but are overridable so the same component also works as the sidebar's compact nav-pill icon.
export default function BriefingIcon({
  size = "h-10 w-10",
  iconSize = "h-6 w-6",
  className,
}: {
  size?: string;
  iconSize?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 ${className ?? ""}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={iconSize}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
        />
      </svg>
    </span>
  );
}
