// Small receipt badge for "Invoices" — same path as the sidebar's own plain
// outline icon (see nav-link.tsx's NAV_ICON_PATHS["/invoices"]), using
// emerald (money) as its identity color. `size`/`iconSize` default to the
// h-10/h-6 badge used elsewhere but are overridable so the same component
// also works as the sidebar's compact nav-pill icon.
export default function InvoicesIcon({
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
      className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ${className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={iconSize}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 14.25 6.75 12M6.75 12l2.25-2.25M6.75 12h10.5M13.5 5.25h5.25a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25H13.5m-9-13.5H3v13.5h1.5"
        />
      </svg>
    </span>
  );
}
