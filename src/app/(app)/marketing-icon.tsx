// Small link/chain badge for "Marketing" — same path as the sidebar's own
// plain outline icon (see nav-link.tsx's NAV_ICON_PATHS["/marketing"]),
// using orange as its identity color. `size`/`iconSize` default to the
// h-10/h-6 badge used elsewhere but are overridable so the same component
// also works as the sidebar's compact nav-pill icon.
export default function MarketingIcon({
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
      className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 ${className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={iconSize}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
        />
      </svg>
    </span>
  );
}
