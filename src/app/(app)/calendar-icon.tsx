// Small calendar badge shown beside the "Calendar" title on the Calendar
// card, its Summary card, and the Calendar page's own header — purely
// decorative, shares the same sky identity color as the rest of that trio.
// `size`/`iconSize` default to that h-10/h-6 badge but are overridable so
// the same component also works as the sidebar's compact nav-pill icon.
export default function CalendarIcon({
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
      className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 ${className ?? ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        className={iconSize}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0V11.25a2.25 2.25 0 0 1 2.25-2.25h13.5a2.25 2.25 0 0 1 2.25 2.25v7.5m-9-6h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm4.5-4.5h.008v.008H12v-.008Zm0 2.25h.008v.008H12v-.008Zm2.25-2.25h.008v.008H14.25v-.008Zm0 2.25h.008v.008H14.25v-.008Zm2.25-2.25h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5v-.008Z"
        />
      </svg>
    </span>
  );
}
