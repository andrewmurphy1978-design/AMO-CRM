// Small checkmark badge for "Tasks" — same path as the sidebar's own plain
// outline icon (see nav-link.tsx's NAV_ICON_PATHS["/tasks"]), using violet
// as its identity color. `size`/`iconSize` default to the h-10/h-6 badge
// used elsewhere but are overridable so the same component also works as
// the sidebar's compact nav-pill icon.
export default function TasksIcon({
  size = "h-10 w-10",
  iconSize = "h-6 w-6",
  className,
}: {
  size?: string;
  iconSize?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 ${className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={iconSize}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    </span>
  );
}
