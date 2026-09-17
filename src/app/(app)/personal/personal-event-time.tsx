"use client";

// Same Zulu-time reasoning as ../email/email-time.tsx — formatting has to
// happen in the browser to pick up a real local timezone. Distinguishes
// all-day events (date only) from timed ones (date + time).
export default function PersonalEventTime({
  iso,
  allDay,
  hour12,
  intlLocale,
}: {
  iso: string;
  allDay: boolean;
  hour12: boolean;
  intlLocale: string;
}) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(intlLocale, { month: "short", day: "numeric" }).format(date);
  if (allDay) return <>{day}</>;
  const time = new Intl.DateTimeFormat(intlLocale, { hour: "numeric", minute: "2-digit", hour12 }).format(date);
  return (
    <>
      {day}, {time}
    </>
  );
}
