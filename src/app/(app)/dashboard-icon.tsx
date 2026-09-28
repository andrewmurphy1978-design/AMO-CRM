// Small house badge for "Dashboard" — same path as the sidebar's own plain
// outline icon (see nav-link.tsx's NAV_ICON_PATHS["/"]), using teal as its
// identity color. `size`/`iconSize` default to the h-10/h-6 badge used
// elsewhere but are overridable so the same component also works as the
// sidebar's compact nav-pill icon.
export default function DashboardIcon({
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
      className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-600 ${className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={iconSize}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12l8.954-8.955a1.5 1.5 0 0 1 2.122 0l8.954 8.955M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
        />
      </svg>
    </span>
  );
}
