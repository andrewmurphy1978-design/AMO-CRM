// Small calendar badge for "Bookings" — same path as the sidebar's own
// plain outline icon (see nav-link.tsx's NAV_ICON_PATHS["/bookings"]),
// using cyan as its identity color (distinct from the Calendar nav item's
// own sky, even though both share the same calendar glyph). `size`/
// `iconSize` default to the h-10/h-6 badge used elsewhere but are
// overridable so the same component also works as the sidebar's compact
// nav-pill icon.
export default function BookingsIcon({
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
      className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-600 ${className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={iconSize}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.75 3v2.25m10.5-2.25v2.25M3.75 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h12a2.25 2.25 0 0 1 2.25 2.25v11.25m-16.5 0a2.25 2.25 0 0 0 2.25 2.25h12a2.25 2.25 0 0 0 2.25-2.25m-16.5 0v-7.5a2.25 2.25 0 0 1 2.25-2.25h12a2.25 2.25 0 0 1 2.25 2.25v7.5"
        />
      </svg>
    </span>
  );
}
